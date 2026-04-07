import type { Router } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { adminMiddleware } from '../admin.ts';
import { validate } from '../validation.ts';
import {
  checkMentorEligibility,
  getMentorEligibilityStats,
  enrollAsMentor,
  unenrollAsMentor,
  getAvailableMentors,
  requestMentorship,
  getMentorships,
  adminCompleteMentorship,
  cancelMentorship,
} from '../mentorships.ts';
import logger, { sanitizeError } from '../logger.ts';
import { z } from 'zod';

// --- Validation schemas ---
const requestMentorshipSchema = z.object({
  mentor_id: z.number().int().positive('Invalid mentor ID'),
  notes: z.string().max(500).optional().nullable(),
});

export default function mentorshipRoutes(router: Router): void {
  // List available mentors (for new sitters)
  router.get('/mentors/available', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const lat = req.query.lat ? Number(req.query.lat) : undefined;
      const lng = req.query.lng ? Number(req.query.lng) : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const offset = req.query.offset ? Number(req.query.offset) : undefined;

      const mentors = await getAvailableMentors({ lat, lng, limit, offset });
      res.json({ mentors });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to list available mentors');
      res.status(500).json({ error: 'Failed to list available mentors' });
    }
  });

  // Check mentor eligibility for current user
  router.get('/mentors/eligibility', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const stats = await getMentorEligibilityStats(req.userId!);
      const eligibility = checkMentorEligibility(stats);
      res.json(eligibility);
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to check mentor eligibility');
      res.status(500).json({ error: 'Failed to check eligibility' });
    }
  });

  // Enroll as mentor
  router.post('/mentors/enroll', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const result = await enrollAsMentor(req.userId!);
      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }
      res.json({ message: 'Enrolled as mentor' });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Mentor enrollment failed');
      res.status(500).json({ error: 'Failed to enroll as mentor' });
    }
  });

  // Unenroll from mentoring
  router.delete('/mentors/enroll', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      await unenrollAsMentor(req.userId!);
      res.json({ message: 'Unenrolled from mentoring' });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Mentor unenrollment failed');
      res.status(500).json({ error: 'Failed to unenroll' });
    }
  });

  // Request a mentorship (mentee picks mentor)
  router.post('/mentorships', authMiddleware, validate(requestMentorshipSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const { mentor_id, notes } = req.body;
      const result = await requestMentorship(req.userId!, mentor_id, notes);

      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }

      res.status(201).json({ mentorship: result.mentorship });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Mentorship request failed');
      res.status(500).json({ error: 'Failed to request mentorship' });
    }
  });

  // Get current user's mentorships (as mentor and/or mentee)
  router.get('/mentorships/me', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const mentorships = await getMentorships(req.userId!);
      res.json(mentorships);
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to get mentorships');
      res.status(500).json({ error: 'Failed to load mentorships' });
    }
  });

  // Cancel a mentorship (mentor or mentee)
  router.put('/mentorships/:id/cancel', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const mentorshipId = Number(req.params.id);
      if (!Number.isInteger(mentorshipId) || mentorshipId <= 0) {
        res.status(400).json({ error: 'Invalid mentorship ID' });
        return;
      }

      const result = await cancelMentorship(mentorshipId, req.userId!);
      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }

      res.json({ message: 'Mentorship cancelled' });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Mentorship cancellation failed');
      res.status(500).json({ error: 'Failed to cancel mentorship' });
    }
  });

  // Admin: manually complete a mentorship
  router.put('/mentorships/:id/complete', adminMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const mentorshipId = Number(req.params.id);
      if (!Number.isInteger(mentorshipId) || mentorshipId <= 0) {
        res.status(400).json({ error: 'Invalid mentorship ID' });
        return;
      }

      const result = await adminCompleteMentorship(mentorshipId);
      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }

      res.json({ message: 'Mentorship completed' });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Admin mentorship completion failed');
      res.status(500).json({ error: 'Failed to complete mentorship' });
    }
  });
}
