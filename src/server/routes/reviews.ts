import type { Router } from 'express';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { validate, createReviewSchema } from '../validation.ts';

export default function reviewRoutes(router: Router): void {
  router.post('/reviews', authMiddleware, validate(createReviewSchema), async (req: AuthenticatedRequest, res) => {
    const { booking_id, rating, comment } = req.body;

    const [booking] = await sql`SELECT * FROM bookings WHERE id = ${booking_id}`;
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }

    if (booking.status !== 'completed') {
      res.status(400).json({ error: 'Can only review completed bookings' });
      return;
    }

    const isOwner = booking.owner_id === req.userId;
    const isSitter = booking.sitter_id === req.userId;
    if (!isOwner && !isSitter) {
      res.status(403).json({ error: 'Not part of this booking' });
      return;
    }

    const revieweeId = isOwner ? booking.sitter_id : booking.owner_id;

    const [existing] = await sql`SELECT id FROM reviews WHERE booking_id = ${booking_id} AND reviewer_id = ${req.userId}`;
    if (existing) {
      res.status(409).json({ error: 'You have already reviewed this booking' });
      return;
    }

    // Block reviews after 3-day window if the other party already reviewed (prevents retaliation)
    const [otherReview] = await sql`SELECT id, created_at FROM reviews WHERE booking_id = ${booking_id} AND reviewer_id = ${revieweeId}`;
    if (otherReview) {
      const otherAge = Date.now() - new Date(otherReview.created_at).getTime();
      if (otherAge > 3 * 24 * 60 * 60 * 1000) {
        res.status(403).json({ error: 'The review window for this booking has closed' });
        return;
      }
    }

    const [review] = await sql`
      INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, comment)
      VALUES (${booking_id}, ${req.userId}, ${revieweeId}, ${rating}, ${comment || null})
      RETURNING id
    `;

    if (otherReview) {
      await sql`UPDATE reviews SET published_at = NOW() WHERE booking_id = ${booking_id} AND published_at IS NULL`;
    }

    res.status(201).json({ id: review.id });
  });

  // Get reviews for a user (only published ones)
  router.get('/reviews/:userId', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const reviews = await sql`
      SELECT r.*, u.name as reviewer_name, u.avatar_url as reviewer_avatar
      FROM reviews r
      JOIN users u ON r.reviewer_id = u.id
      WHERE r.reviewee_id = ${req.params.userId} AND (r.published_at IS NOT NULL OR r.created_at < NOW() - INTERVAL '3 days')
      ORDER BY r.created_at DESC
    `;

    res.json({ reviews });
  });
}
