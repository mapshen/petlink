import type { Router } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { validate } from '../validation.ts';
import { z } from 'zod';
import {
  proposeAgreement,
  acceptAgreement,
  cancelAgreement,
  getAgreements,
  getMentorshipEarnings,
} from '../mentorship-revenue.ts';
import logger, { sanitizeError } from '../logger.ts';

const proposeAgreementSchema = z.object({
  mentorship_id: z.number().int().positive(),
  share_percentage: z.number().int().min(1).max(15),
  duration_months: z.number().int().min(1).max(12),
  min_earnings_cents: z.number().int().min(0).max(100000).optional(),
});

export default function mentorshipRevenueRoutes(router: Router): void {
  // Propose a revenue-sharing agreement (mentor only)
  router.post('/mentorship-agreements', authMiddleware, validate(proposeAgreementSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const { mentorship_id, share_percentage, duration_months, min_earnings_cents } = req.body;
      const result = await proposeAgreement(mentorship_id, req.userId!, share_percentage, duration_months, min_earnings_cents);
      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }
      res.status(201).json({ agreement: result.agreement });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to propose agreement');
      res.status(500).json({ error: 'Failed to propose agreement' });
    }
  });

  // Accept agreement (mentee only)
  router.put('/mentorship-agreements/:id/accept', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const result = await acceptAgreement(Number(req.params.id), req.userId!);
      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }
      res.json({ agreement: result.agreement });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to accept agreement');
      res.status(500).json({ error: 'Failed to accept agreement' });
    }
  });

  // Cancel agreement (either party)
  router.put('/mentorship-agreements/:id/cancel', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const result = await cancelAgreement(Number(req.params.id), req.userId!);
      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to cancel agreement');
      res.status(500).json({ error: 'Failed to cancel agreement' });
    }
  });

  // Get my agreements
  router.get('/mentorship-agreements/me', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const agreements = await getAgreements(req.userId!);
      res.json(agreements);
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to load agreements');
      res.status(500).json({ error: 'Failed to load agreements' });
    }
  });

  // Get mentorship earnings summary
  router.get('/mentorship-earnings', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const yearRaw = req.query.year ? Number(req.query.year) : undefined;
      if (yearRaw !== undefined && (!Number.isInteger(yearRaw) || yearRaw < 2000 || yearRaw > 2100)) {
        res.status(400).json({ error: 'Invalid year parameter' });
        return;
      }
      const year = yearRaw;
      const earnings = await getMentorshipEarnings(req.userId!, year);
      res.json(earnings);
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to load mentorship earnings');
      res.status(500).json({ error: 'Failed to load mentorship earnings' });
    }
  });
}
