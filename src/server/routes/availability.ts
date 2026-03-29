import type { Router } from 'express';
import type { RateLimitRequestHandler } from 'express-rate-limit';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { validate, availabilitySchema } from '../validation.ts';
import { botBlockMiddleware, requireUserAgent } from '../bot-detection.ts';

export default function availabilityRoutes(router: Router, publicLimiter: RateLimitRequestHandler): void {
  router.get('/availability/:sitterId', requireUserAgent, botBlockMiddleware, publicLimiter, async (req, res) => {
    const slots = await sql`
      SELECT * FROM availability WHERE sitter_id = ${req.params.sitterId} ORDER BY day_of_week, start_time
    `;
    res.json({ slots });
  });

  router.post('/availability', authMiddleware, validate(availabilitySchema), async (req: AuthenticatedRequest, res) => {
    const [currentUser] = await sql`SELECT role, approval_status FROM users WHERE id = ${req.userId}`;
    if (currentUser.role !== 'sitter' && currentUser.role !== 'both') {
      res.status(403).json({ error: 'Only sitters can set availability.' });
      return;
    }
    const { day_of_week, specific_date, start_time, end_time, recurring } = req.body;
    const [slot] = await sql`
      INSERT INTO availability (sitter_id, day_of_week, specific_date, start_time, end_time, recurring)
      VALUES (${req.userId}, ${day_of_week ?? null}, ${specific_date || null}, ${start_time}, ${end_time}, ${recurring ? true : false})
      RETURNING *
    `;
    res.status(201).json({ slot });
  });

  router.delete('/availability/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [slot] = await sql`SELECT * FROM availability WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
    if (!slot) {
      res.status(404).json({ error: 'Availability slot not found' });
      return;
    }
    await sql`DELETE FROM availability WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
    res.json({ success: true });
  });
}
