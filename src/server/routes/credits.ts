import type { Router } from 'express';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { adminMiddleware } from '../admin.ts';
import { validate, issueCreditSchema } from '../validation.ts';
import { getBalance, getCreditHistory, issueCredit } from '../credits.ts';
import logger, { sanitizeError } from '../logger.ts';

export default function creditRoutes(router: Router): void {
  // Get current user's credit balance
  router.get('/credits/balance', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const balance = await getBalance(req.userId!);
      res.json({ balance_cents: balance });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Credit balance error');
      res.status(500).json({ error: 'Failed to load credit balance' });
    }
  });

  // Get current user's credit history (paginated)
  router.get('/credits/history', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const entries = await getCreditHistory(req.userId!, limit, offset);
      res.json({ entries });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Credit history error');
      res.status(500).json({ error: 'Failed to load credit history' });
    }
  });

  // Admin-only: issue credits to a user
  router.post('/credits/issue', adminMiddleware, validate(issueCreditSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const { user_id, amount_cents, type, description, expires_at } = req.body;

      // Verify target user exists
      const [target] = await sql`SELECT id FROM users WHERE id = ${user_id}`;
      if (!target) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const entry = await issueCredit(
        user_id,
        amount_cents,
        type,
        'admin_grant',
        description,
        null,
        expires_at ?? null
      );

      res.status(201).json({ entry });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Credit issuance error');
      res.status(500).json({ error: 'Failed to issue credits' });
    }
  });
}
