import type { Router } from 'express';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { validate, createTipSchema } from '../validation.ts';
import { createPaymentIntent } from '../payments.ts';
import { createNotification } from '../notifications.ts';
import logger, { sanitizeError } from '../logger.ts';
import { formatCents } from '../../lib/money.ts';

export default function tipRoutes(router: Router): void {
  // Create a tip for a completed booking
  router.post('/tips', authMiddleware, validate(createTipSchema), async (req: AuthenticatedRequest, res) => {
    const { booking_id, amount_cents } = req.body;

    // Verify booking exists, is completed, and user is the owner
    const [booking] = await sql`
      SELECT id, owner_id, sitter_id, status
      FROM bookings WHERE id = ${booking_id}
    `;
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }
    if (booking.owner_id !== req.userId) {
      res.status(403).json({ error: 'Only the pet owner can tip for this booking' });
      return;
    }
    if (booking.status !== 'completed') {
      res.status(400).json({ error: 'Tips can only be given for completed bookings' });
      return;
    }

    // Check for existing tip
    const [existing] = await sql`
      SELECT id FROM tips WHERE booking_id = ${booking_id} AND tipper_id = ${req.userId}
    `;
    if (existing) {
      res.status(409).json({ error: 'You have already tipped for this booking' });
      return;
    }

    try {
      // Create Stripe payment intent for the tip
      const { clientSecret, paymentIntentId } = await createPaymentIntent(amount_cents);

      const [tip] = await sql`
        INSERT INTO tips (booking_id, tipper_id, sitter_id, amount_cents, stripe_payment_intent_id, status)
        VALUES (${booking_id}, ${req.userId}, ${booking.sitter_id}, ${amount_cents}, ${paymentIntentId}, 'pending')
        RETURNING id, booking_id, tipper_id, sitter_id, amount_cents, status, created_at
      `;

      res.status(201).json({ tip, clientSecret });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Tip creation error');
      res.status(500).json({ error: 'Failed to process tip' });
    }
  });

  // Get tip for a specific booking
  router.get('/tips/booking/:bookingId', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const bookingId = parseInt(req.params.bookingId, 10);
    if (isNaN(bookingId)) {
      res.status(400).json({ error: 'Invalid booking ID' });
      return;
    }

    const [booking] = await sql`
      SELECT owner_id, sitter_id FROM bookings WHERE id = ${bookingId}
    `;
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }
    if (booking.owner_id !== req.userId && booking.sitter_id !== req.userId) {
      res.status(403).json({ error: 'Not part of this booking' });
      return;
    }

    const [tip] = await sql`
      SELECT id, booking_id, tipper_id, sitter_id, amount_cents, status, created_at
      FROM tips WHERE booking_id = ${bookingId}
    `;

    res.json({ tip: tip || null });
  });

  // Webhook-style: mark tip as succeeded (called after Stripe confirms)
  // In production, this would be handled by the Stripe webhook
  // For now, we expose a simple endpoint for the frontend to confirm
  router.post('/tips/:id/confirm', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const tipId = parseInt(req.params.id, 10);
    if (isNaN(tipId)) {
      res.status(400).json({ error: 'Invalid tip ID' });
      return;
    }

    const [tip] = await sql`
      SELECT * FROM tips WHERE id = ${tipId} AND tipper_id = ${req.userId} AND status = 'pending'
    `;
    if (!tip) {
      res.status(404).json({ error: 'Tip not found or already processed' });
      return;
    }

    await sql`UPDATE tips SET status = 'succeeded' WHERE id = ${tipId}`;

    // Notify sitter
    const [tipper] = await sql`SELECT name FROM users WHERE id = ${req.userId}`;
    const notification = await createNotification(
      tip.sitter_id,
      'payment_update',
      'You received a tip!',
      `${tipper.name} tipped you ${formatCents(tip.amount_cents)} for your service.`,
      { booking_id: tip.booking_id, tip_id: tipId }
    );

    res.json({ success: true });
  });
}
