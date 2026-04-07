import type { Router } from 'express';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { validate, applyReferralCodeSchema } from '../validation.ts';
import { getOrCreateReferralCode, applyReferralCode, getReferralStats } from '../referrals.ts';
import logger, { sanitizeError } from '../logger.ts';

export default function referralRoutes(router: Router): void {
  // Get (or generate) the current user's referral code
  router.get('/referrals/code', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const code = await getOrCreateReferralCode(req.userId!);
      res.json({ code });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Referral code error');
      res.status(500).json({ error: 'Failed to get referral code' });
    }
  });

  // Apply a referral code (used during or after signup)
  router.post('/referrals/apply', authMiddleware, validate(applyReferralCodeSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const { code } = req.body;
      const result = await applyReferralCode(req.userId!, code);
      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }
      res.json({ success: true, referral: result.referral });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Apply referral code error');
      res.status(500).json({ error: 'Failed to apply referral code' });
    }
  });

  // Get referral dashboard stats
  router.get('/referrals/stats', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const stats = await getReferralStats(req.userId!);
      res.json(stats);
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Referral stats error');
      res.status(500).json({ error: 'Failed to load referral stats' });
    }
  });

  // Get referral history (people you've referred)
  router.get('/referrals/history', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);

      const referrals = await sql`
        SELECT r.id, u.name AS referred_name, u.avatar_url AS referred_avatar,
               r.status, r.created_at, r.completed_at
        FROM referrals r
        JOIN users u ON u.id = r.referred_id
        WHERE r.referrer_id = ${req.userId}
        ORDER BY r.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      res.json({ referrals });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Referral history error');
      res.status(500).json({ error: 'Failed to load referral history' });
    }
  });
}
