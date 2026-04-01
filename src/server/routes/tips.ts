import type { Router } from 'express';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { validate, createTipSchema } from '../validation.ts';
import { createAutoPaymentIntent, getStripe } from '../payments.ts';
import { createNotification } from '../notifications.ts';
import logger, { sanitizeError } from '../logger.ts';
import { formatCents } from '../../lib/money.ts';

export default function tipRoutes(router: Router): void {
  // Create a tip for a completed booking
  router.post('/tips', authMiddleware, validate(createTipSchema), async (req: AuthenticatedRequest, res) => {
    const { booking_id, amount_cents } = req.body;

    try {
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

      // Use advisory lock + transaction to prevent race condition on tip creation
      const result = await sql.begin(async (tx: any) => {
        await tx`SELECT pg_advisory_xact_lock(2, ${booking_id})`; // namespace 2 = tips (1 = bookings)

        const [existing] = await tx`
          SELECT id, status FROM tips WHERE booking_id = ${booking_id} AND tipper_id = ${req.userId}
        `;
        if (existing && existing.status === 'succeeded') {
          return { error: 'You have already tipped for this booking', status: 409 };
        }
        if (existing && existing.status === 'pending') {
          await tx`DELETE FROM tips WHERE id = ${existing.id}`;
        }

        // Insert tip row first, then create Stripe intent (so DB has the record before charging)
        const [tip] = await tx`
          INSERT INTO tips (booking_id, tipper_id, sitter_id, amount_cents, status)
          VALUES (${booking_id}, ${req.userId}, ${booking.sitter_id}, ${amount_cents}, 'pending')
          RETURNING id, booking_id, tipper_id, sitter_id, amount_cents, status, created_at
        `;

        const { clientSecret, paymentIntentId } = await createAutoPaymentIntent(amount_cents);
        await tx`UPDATE tips SET stripe_payment_intent_id = ${paymentIntentId} WHERE id = ${tip.id}`;

        return { tip, clientSecret };
      });

      if ('error' in result) {
        res.status(result.status).json({ error: result.error });
        return;
      }

      res.status(201).json({ tip: result.tip, clientSecret: result.clientSecret });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Tip creation error');
      res.status(500).json({ error: 'Failed to process tip' });
    }
  });

  // Get tip for a specific booking
  router.get('/tips/booking/:bookingId', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
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
        FROM tips WHERE booking_id = ${bookingId} AND status = 'succeeded'
      `;

      res.json({ tip: tip || null });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Error fetching tip');
      res.status(500).json({ error: 'Failed to fetch tip' });
    }
  });

  // Confirm tip payment — verifies with Stripe before marking succeeded
  router.post('/tips/:id/confirm', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const tipId = parseInt(req.params.id, 10);
      if (isNaN(tipId)) {
        res.status(400).json({ error: 'Invalid tip ID' });
        return;
      }

      const [tip] = await sql`
        SELECT id, tipper_id, sitter_id, booking_id, amount_cents, stripe_payment_intent_id, status
        FROM tips WHERE id = ${tipId} AND tipper_id = ${req.userId} AND status = 'pending'
      `;
      if (!tip) {
        res.status(404).json({ error: 'Tip not found or already processed' });
        return;
      }

      // Verify payment actually succeeded with Stripe and amount matches
      const stripe = getStripe();
      const paymentIntent = await stripe.paymentIntents.retrieve(tip.stripe_payment_intent_id);
      if (paymentIntent.status !== 'succeeded') {
        res.status(400).json({ error: 'Payment has not been completed' });
        return;
      }
      if (paymentIntent.amount !== tip.amount_cents) {
        res.status(400).json({ error: 'Payment amount mismatch' });
        return;
      }

      await sql`UPDATE tips SET status = 'succeeded' WHERE id = ${tipId}`;

      // Notify sitter
      const [tipper] = await sql`SELECT name FROM users WHERE id = ${req.userId}`;
      const tipperName = tipper?.name ?? 'Someone';
      const notification = await createNotification(
        tip.sitter_id,
        'payment_update',
        'You received a tip!',
        `${tipperName} tipped you ${formatCents(tip.amount_cents)} for your service.`,
        { booking_id: tip.booking_id, tip_id: tipId }
      );

      res.json({ success: true });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Tip confirmation error');
      res.status(500).json({ error: 'Failed to confirm tip' });
    }
  });
}
