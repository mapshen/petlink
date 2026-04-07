import type { Router } from 'express';
import type { Server } from 'socket.io';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { validate, quickTapEventSchema } from '../validation.ts';
import { createNotification } from '../notifications.ts';
import { recordPayoutForBooking } from '../payouts.ts';
import { calculateApplicationFee } from '../stripe-connect.ts';
import { capturePayment } from '../payments.ts';
import { MAX_POSTS_PER_SITTER } from './posts.ts';
import { completeReferral } from '../referrals.ts';
import { checkMentorshipCompletion } from '../mentorships.ts';
import logger, { sanitizeError } from '../logger.ts';

export default function walkRoutes(router: Router, io: Server): void {
  router.get('/walks/:bookingId/events', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [booking] = await sql`SELECT id, owner_id, sitter_id, status FROM bookings WHERE id = ${req.params.bookingId}`;
      if (!booking) {
        res.status(404).json({ error: 'Booking not found' });
        return;
      }
      if (booking.owner_id !== req.userId && booking.sitter_id !== req.userId) {
        res.status(403).json({ error: 'Not part of this booking' });
        return;
      }
      const events = await sql`
        SELECT we.*, p.name as pet_name
        FROM walk_events we
        LEFT JOIN pets p ON we.pet_id = p.id
        WHERE we.booking_id = ${req.params.bookingId}
        ORDER BY we.created_at ASC
      `;
      res.json({ events });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch walk events');
      res.status(500).json({ error: 'Failed to fetch walk events' });
    }
  });

  router.post('/walks/:bookingId/events', authMiddleware, validate(quickTapEventSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const [booking] = await sql`SELECT id, owner_id, sitter_id, status, service_id, deposit_status, payment_intent_id, total_price_cents FROM bookings WHERE id = ${req.params.bookingId}`;
      if (!booking || booking.sitter_id !== req.userId) {
        res.status(403).json({ error: 'Only the sitter can log walk events' });
        return;
      }
      if (!['confirmed', 'in_progress'].includes(booking.status)) {
        res.status(400).json({ error: 'Walk events can only be logged on active bookings' });
        return;
      }
      const { event_type, lat, lng, note, photo_url, video_url, pet_id } = req.body;

      // Limit video clips to 5 per booking
      if (event_type === 'video') {
        const [{ count }] = await sql`SELECT count(*)::int as count FROM walk_events WHERE booking_id = ${req.params.bookingId} AND event_type = 'video'`;
        if (count >= 5) {
          res.status(400).json({ error: 'Maximum 5 video clips per booking' });
          return;
        }
      }

      if (pet_id != null) {
        const [validPet] = await sql`SELECT 1 FROM booking_pets WHERE booking_id = ${req.params.bookingId} AND pet_id = ${pet_id}`;
        if (!validPet) {
          res.status(400).json({ error: 'Pet is not part of this booking' });
          return;
        }
      }
      const [event] = await sql`
        INSERT INTO walk_events (booking_id, event_type, lat, lng, note, photo_url, video_url, pet_id)
        VALUES (${req.params.bookingId}, ${event_type}, ${lat || null}, ${lng || null}, ${note || null}, ${photo_url || null}, ${video_url || null}, ${pet_id || null})
        RETURNING *
      `;

      // Auto-create sitter post for photo/video events (#275)
      if ((event_type === 'photo' && photo_url) || (event_type === 'video' && video_url)) {
        const postType = event_type === 'photo' ? 'walk_photo' : 'walk_video';
        await sql`
          INSERT INTO sitter_posts (sitter_id, content, photo_url, video_url, booking_id, walk_event_id, post_type)
          SELECT ${req.userId}, ${note || null}, ${photo_url || null}, ${video_url || null}, ${Number(req.params.bookingId)}, ${event.id}, ${postType}
          WHERE (SELECT COUNT(*) FROM sitter_posts WHERE sitter_id = ${req.userId}) < ${MAX_POSTS_PER_SITTER}
        `.catch((err) => { logger.error({ err: sanitizeError(err) }, 'Auto-post creation failed'); });
      }

      // If event is 'start', update booking to in_progress and notify owner
      if (event_type === 'start') {
        await sql`UPDATE bookings SET status = 'in_progress' WHERE id = ${req.params.bookingId}`;
        const [sitterUser] = await sql`SELECT name FROM users WHERE id = ${req.userId}`;
        const startNotif = await createNotification(booking.owner_id, 'walk_started', 'Walk Started', `${sitterUser.name} has started the walk.`, { booking_id: Number(req.params.bookingId) });
        if (startNotif) io.to(String(booking.owner_id)).emit('notification', startNotif);
      }
      // If event is 'end', update booking to completed, schedule payout, and notify owner
      if (event_type === 'end') {
        await sql`UPDATE bookings SET status = 'completed' WHERE id = ${req.params.bookingId}`;

        // Capture meet & greet deposit on completion (held → captured_as_deposit)
        if (booking.deposit_status === 'held' && booking.payment_intent_id) {
          try {
            await capturePayment(booking.payment_intent_id);
            await sql`UPDATE bookings SET deposit_status = 'captured_as_deposit' WHERE id = ${req.params.bookingId}`;
          } catch (err) {
            logger.error({ err: sanitizeError(err), bookingId: req.params.bookingId }, 'Failed to capture meet & greet deposit');
          }
        }

        const [sitterUser] = await sql`SELECT name FROM users WHERE id = ${req.userId}`;
        const endNotif = await createNotification(booking.owner_id, 'walk_completed', 'Walk Completed', `${sitterUser.name} has completed the walk.`, { booking_id: Number(req.params.bookingId) });
        if (endNotif) io.to(String(booking.owner_id)).emit('notification', endNotif);

        // Complete referral if this is the referred user's first booking
        completeReferral(booking.owner_id).catch((err: unknown) => {
          logger.error({ err: sanitizeError(err), ownerId: booking.owner_id }, 'Referral completion failed');
        });

        // Check if sitter (as mentee) has completed enough bookings to graduate mentorship
        checkMentorshipCompletion(booking.sitter_id).catch((err: unknown) => {
          logger.error({ err: sanitizeError(err), sitterId: booking.sitter_id }, 'Mentorship completion check failed');
        });

        // Record payout tracking entry — actual payout delivery is handled by Stripe Connect
        if (booking.total_price_cents && booking.total_price_cents > 0) {
          const [sitterInfo] = await sql`SELECT subscription_tier FROM users WHERE id = ${booking.sitter_id}`;
          const fee = calculateApplicationFee(booking.total_price_cents, sitterInfo?.subscription_tier || 'free');
          const sitterNet = booking.total_price_cents - fee;
          await recordPayoutForBooking(
            Number(req.params.bookingId),
            booking.sitter_id,
            sitterNet
          );
          const payoutNotif = await createNotification(booking.sitter_id, 'payment_update', 'Payout Scheduled', 'Your payout will be processed by Stripe automatically.', { booking_id: Number(req.params.bookingId) });
          if (payoutNotif) io.to(String(booking.sitter_id)).emit('notification', payoutNotif);
        }
      }

      res.status(201).json({ event });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to log walk event');
      res.status(500).json({ error: 'Failed to log walk event' });
    }
  });

  // --- Care Summary (auto-generated from events) ---
  router.get('/walks/:bookingId/summary', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [booking] = await sql`SELECT id, owner_id, sitter_id FROM bookings WHERE id = ${req.params.bookingId}`;
      if (!booking) {
        res.status(404).json({ error: 'Booking not found' });
        return;
      }
      if (booking.owner_id !== req.userId && booking.sitter_id !== req.userId) {
        res.status(403).json({ error: 'Not part of this booking' });
        return;
      }

      const events = await sql`
        SELECT we.event_type, we.note, we.created_at, p.name as pet_name
        FROM walk_events we
        LEFT JOIN pets p ON we.pet_id = p.id
        WHERE we.booking_id = ${req.params.bookingId}
        ORDER BY we.created_at ASC
      `;

      // Build summary counts
      const counts: Record<string, number> = {};
      const notes: string[] = [];
      let startTime: string | null = null;
      let endTime: string | null = null;

      for (const e of events) {
        counts[e.event_type] = (counts[e.event_type] || 0) + 1;
        if (e.note) notes.push(e.note);
        if (e.event_type === 'start') startTime = e.created_at;
        if (e.event_type === 'end') endTime = e.created_at;
      }

      const duration = startTime && endTime
        ? Math.round((new Date(endTime).getTime() - new Date(startTime).getTime()) / 60000)
        : null;

      res.json({
        summary: {
          total_events: events.length,
          duration_minutes: duration,
          counts,
          notes,
          events,
        },
      });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch walk summary');
      res.status(500).json({ error: 'Failed to fetch walk summary' });
    }
  });
}
