import type { Router } from 'express';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { validate, loyaltyDiscountListSchema } from '../validation.ts';
import logger, { sanitizeError } from '../logger.ts';

export default function loyaltyDiscountRoutes(router: Router): void {
  // Get sitter's loyalty discount tiers
  router.get('/loyalty-discounts', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
      if (!user?.roles?.includes('sitter')) {
        res.status(403).json({ error: 'Sitter role required' });
        return;
      }

      const tiers = await sql`
        SELECT id, sitter_id, min_bookings, discount_percent, created_at
        FROM loyalty_discounts
        WHERE sitter_id = ${req.userId}
        ORDER BY min_bookings ASC
      `;
      res.json({ tiers });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch loyalty discounts');
      res.status(500).json({ error: 'Failed to fetch loyalty discounts' });
    }
  });

  // Get a specific sitter's loyalty tiers (public, for booking flow)
  router.get('/loyalty-discounts/sitter/:sitterId', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const sitterId = Number(req.params.sitterId);
      if (!Number.isInteger(sitterId) || sitterId <= 0) {
        res.status(400).json({ error: 'Invalid sitter ID' });
        return;
      }

      const tiers = await sql`
        SELECT min_bookings, discount_percent
        FROM loyalty_discounts
        WHERE sitter_id = ${sitterId}
        ORDER BY min_bookings ASC
      `;

      // Count completed bookings between current user and sitter
      const [{ count: completedBookings }] = await sql`
        SELECT COUNT(*)::int as count
        FROM bookings
        WHERE owner_id = ${req.userId} AND sitter_id = ${sitterId}
          AND status = 'completed'
      `;

      res.json({ tiers, completed_bookings: completedBookings });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch sitter loyalty discounts');
      res.status(500).json({ error: 'Failed to fetch loyalty discounts' });
    }
  });

  // Replace all loyalty discount tiers (upsert)
  router.put('/loyalty-discounts', authMiddleware, validate(loyaltyDiscountListSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
      if (!user?.roles?.includes('sitter')) {
        res.status(403).json({ error: 'Sitter role required' });
        return;
      }

      const { tiers } = req.body;

      // Validate no duplicate min_bookings
      const minBookingValues = tiers.map((t: { min_bookings: number }) => t.min_bookings);
      if (new Set(minBookingValues).size !== minBookingValues.length) {
        res.status(400).json({ error: 'Duplicate min_bookings thresholds are not allowed' });
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await sql.begin(async (tx: any) => {
        // Delete existing tiers
        await tx`DELETE FROM loyalty_discounts WHERE sitter_id = ${req.userId}`;

        if (tiers.length === 0) {
          return [];
        }

        // Insert new tiers
        const rows = tiers.map((t: { min_bookings: number; discount_percent: number }) => ({
          sitter_id: req.userId,
          min_bookings: t.min_bookings,
          discount_percent: t.discount_percent,
        }));
        return tx`
          INSERT INTO loyalty_discounts ${tx(rows, 'sitter_id', 'min_bookings', 'discount_percent')}
          RETURNING id, sitter_id, min_bookings, discount_percent, created_at
        `;
      });

      res.json({ tiers: result });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to update loyalty discounts');
      res.status(500).json({ error: 'Failed to update loyalty discounts' });
    }
  });
}
