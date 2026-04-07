import type { Router } from 'express';
import { type AuthenticatedRequest, authMiddleware } from '../auth.ts';
import { adminMiddleware } from '../admin.ts';
import { validate, banActionSchema, banAppealSchema, appealReviewSchema } from '../validation.ts';
import {
  issueBanAction,
  getBanHistory,
  getEffectiveBanStatus,
  submitAppeal,
  listPendingAppeals,
  reviewAppeal,
} from '../ban-actions.ts';
import logger, { sanitizeError } from '../logger.ts';

export default function banActionRoutes(router: Router): void {
  // --- Admin endpoints ---

  // Issue a ban action (warning/suspension/ban)
  router.post('/admin/users/:id/ban-action', adminMiddleware, validate(banActionSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const userId = Number(req.params.id);
      if (!userId || isNaN(userId)) {
        res.status(400).json({ error: 'Invalid user ID' });
        return;
      }

      if (userId === req.userId) {
        res.status(400).json({ error: 'Cannot issue a ban action against yourself' });
        return;
      }

      const { action_type, reason, description, expires_at } = req.body;

      const expiresDate = expires_at ? new Date(expires_at) : null;
      if (action_type === 'suspension' && !expiresDate) {
        res.status(400).json({ error: 'Suspensions require an expires_at date' });
        return;
      }

      const action = await issueBanAction(
        userId,
        action_type,
        reason,
        description,
        req.userId!,
        expiresDate
      );
      res.status(201).json({ action });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to issue ban action');
      res.status(500).json({ error: 'Failed to issue ban action' });
    }
  });

  // Get ban history for a user
  router.get('/admin/users/:id/ban-history', adminMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const userId = Number(req.params.id);
      if (!userId || isNaN(userId)) {
        res.status(400).json({ error: 'Invalid user ID' });
        return;
      }

      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const result = await getBanHistory(userId, limit, offset);
      res.json(result);
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch ban history');
      res.status(500).json({ error: 'Failed to fetch ban history' });
    }
  });

  // List pending appeals
  router.get('/admin/appeals', adminMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const result = await listPendingAppeals(limit, offset);
      res.json(result);
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch appeals');
      res.status(500).json({ error: 'Failed to fetch appeals' });
    }
  });

  // Review an appeal (approve/deny)
  router.put('/admin/appeals/:id', adminMiddleware, validate(appealReviewSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const appealId = Number(req.params.id);
      if (!appealId || isNaN(appealId)) {
        res.status(400).json({ error: 'Invalid appeal ID' });
        return;
      }

      const { status, admin_response } = req.body;
      const appeal = await reviewAppeal(appealId, status, admin_response, req.userId!);
      if (!appeal) {
        res.status(404).json({ error: 'Appeal not found or already reviewed' });
        return;
      }
      res.json({ appeal });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to review appeal');
      res.status(500).json({ error: 'Failed to review appeal' });
    }
  });

  // --- User endpoints ---

  // Get my ban status
  router.get('/ban-status/me', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const result = await getEffectiveBanStatus(req.userId!);
      res.json(result);
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch ban status');
      res.status(500).json({ error: 'Failed to fetch ban status' });
    }
  });

  // Submit an appeal
  router.post('/ban-appeals', authMiddleware, validate(banAppealSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const { ban_action_id, reason } = req.body;
      const appeal = await submitAppeal(req.userId!, ban_action_id, reason);
      if (!appeal) {
        res.status(400).json({ error: 'Cannot submit appeal. Either the action does not exist, is a warning, or an appeal was already submitted.' });
        return;
      }
      res.status(201).json({ appeal });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to submit appeal');
      res.status(500).json({ error: 'Failed to submit appeal' });
    }
  });
}
