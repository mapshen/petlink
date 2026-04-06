import type { Router } from 'express';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { adminMiddleware } from '../admin.ts';
import { getActiveStrikeWeight, getStrikeHistory } from '../reliability.ts';
import logger, { sanitizeError } from '../logger.ts';

export default function reliabilityRoutes(router: Router): void {
  // Sitter's own reliability score
  router.get('/reliability/score', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
      if (!user?.roles?.includes('sitter')) {
        res.status(403).json({ error: 'Only sitters can view reliability score' });
        return;
      }
      const activeWeight = await getActiveStrikeWeight(req.userId!);
      let status: 'good' | 'warning' | 'at_risk' | 'suspended' = 'good';
      if (activeWeight >= 7) status = 'suspended';
      else if (activeWeight >= 5) status = 'at_risk';
      else if (activeWeight >= 1) status = 'warning';

      res.json({ active_strikes: activeWeight, status });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Reliability score error');
      res.status(500).json({ error: 'Failed to load reliability score' });
    }
  });

  // Sitter's own strike history
  router.get('/reliability/history', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
      if (!user?.roles?.includes('sitter')) {
        res.status(403).json({ error: 'Only sitters can view strike history' });
        return;
      }
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const strikes = await getStrikeHistory(req.userId!, limit, offset);
      res.json({ strikes });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Strike history error');
      res.status(500).json({ error: 'Failed to load strike history' });
    }
  });

  // Admin: view a sitter's strike history
  router.get('/admin/sitters/:id/strikes', adminMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const sitterId = Number(req.params.id);
      if (!Number.isInteger(sitterId) || sitterId <= 0) {
        res.status(400).json({ error: 'Invalid sitter ID' });
        return;
      }
      const activeWeight = await getActiveStrikeWeight(sitterId);
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const strikes = await getStrikeHistory(sitterId, limit, offset);
      res.json({ active_strikes: activeWeight, strikes });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Admin strike history error');
      res.status(500).json({ error: 'Failed to load strike history' });
    }
  });
}
