import type { Router } from 'express';
import { type AuthenticatedRequest, authMiddleware } from '../auth.ts';
import { adminMiddleware } from '../admin.ts';
import { getProPeriodWithDaysRemaining } from '../pro-periods.ts';
import { getProPeriodSavings } from '../pro-period-savings.ts';
import { setSetting } from '../platform-settings.ts';
import sql from '../db.ts';
import logger, { sanitizeError } from '../logger.ts';

export default function proPeriodRoutes(router: Router): void {
  // Get current user's active pro period with days remaining
  router.get('/pro-period/me', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const period = await getProPeriodWithDaysRemaining(req.userId!);
      res.json({ period });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch pro period');
      res.status(500).json({ error: 'Failed to fetch pro period' });
    }
  });

  // Get current user's savings during their active pro period
  router.get('/pro-period/savings', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const savings = await getProPeriodSavings(req.userId!);
      res.json({ savings });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch pro period savings');
      res.status(500).json({ error: 'Failed to fetch pro period savings' });
    }
  });

  // Admin: list trial sitters
  router.get('/admin/trials', adminMiddleware, async (_req: AuthenticatedRequest, res) => {
    try {
      const sitters = await sql`
        SELECT u.id, u.name, u.email, u.avatar_url, u.pro_trial_used,
               pp.id as period_id, pp.starts_at, pp.ends_at, pp.status as period_status,
               (SELECT count(*)::int FROM bookings WHERE sitter_id = u.id AND status IN ('completed', 'confirmed', 'in_progress')) as booking_count
        FROM users u
        JOIN pro_periods pp ON pp.user_id = u.id AND pp.source = 'trial'
        ORDER BY pp.created_at DESC
      `;
      res.json({ sitters });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch trial sitters');
      res.status(500).json({ error: 'Failed to fetch trial sitters' });
    }
  });

  // Admin: extend a trial
  router.post('/admin/trials/:userId/extend', adminMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const targetUserId = Number(req.params.userId);
      if (!targetUserId || isNaN(targetUserId)) {
        res.status(400).json({ error: 'Invalid user ID' });
        return;
      }

      const { additional_days } = req.body;
      if (!additional_days || typeof additional_days !== 'number' || !Number.isInteger(additional_days) || additional_days <= 0 || additional_days > 365) {
        res.status(400).json({ error: 'additional_days must be a positive integer (max 365)' });
        return;
      }

      const [updated] = await sql`
        UPDATE pro_periods
        SET ends_at = ends_at + INTERVAL '1 day' * ${additional_days}
        WHERE user_id = ${targetUserId} AND source = 'trial' AND status = 'active'
        RETURNING *
      `;
      if (!updated) {
        res.status(404).json({ error: 'No active trial found for this user' });
        return;
      }
      res.json({ period: updated });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to extend trial');
      res.status(500).json({ error: 'Failed to extend trial' });
    }
  });

  // Admin: update trial duration setting
  router.put('/admin/settings/trial-duration', adminMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const { days } = req.body;
      if (!days || typeof days !== 'number' || days <= 0 || days > 365) {
        res.status(400).json({ error: 'days must be between 1 and 365' });
        return;
      }
      await setSetting('pro_trial_days', { days }, req.userId!);
      res.json({ days });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to update trial duration');
      res.status(500).json({ error: 'Failed to update trial duration' });
    }
  });
}
