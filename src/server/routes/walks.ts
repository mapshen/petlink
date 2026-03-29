import type { Router } from 'express';
import type { Server } from 'socket.io';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { validate, quickTapEventSchema } from '../validation.ts';
import { createNotification } from '../notifications.ts';
import { schedulePayoutForBooking, getPayoutDelay } from '../payouts.ts';

export default function walkRoutes(router: Router, io: Server): void {
  router.get('/walks/:bookingId/events', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [booking] = await sql`SELECT * FROM bookings WHERE id = ${req.params.bookingId}`;
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
  });

  router.post('/walks/:bookingId/events', authMiddleware, validate(quickTapEventSchema), async (req: AuthenticatedRequest, res) => {
    const [booking] = await sql`SELECT * FROM bookings WHERE id = ${req.params.bookingId}`;
    if (!booking || booking.sitter_id !== req.userId) {
      res.status(403).json({ error: 'Only the sitter can log walk events' });
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

    // If event is 'start', update booking to in_progress and notify owner
    if (event_type === 'start') {
      await sql`UPDATE bookings SET status = 'in_progress' WHERE id = ${req.params.bookingId}`;
      const [sitterUser] = await sql`SELECT name FROM users WHERE id = ${req.userId}`;
      const startNotif = await createNotification(booking.owner_id, 'walk_started', 'Walk Started', `${sitterUser.name} has started the walk.`, { booking_id: Number(req.params.bookingId) });
      io.to(String(booking.owner_id)).emit('notification', startNotif);
    }
    // If event is 'end', update booking to completed, schedule payout, and notify owner
    if (event_type === 'end') {
      await sql`UPDATE bookings SET status = 'completed' WHERE id = ${req.params.bookingId}`;
      const [sitterUser] = await sql`SELECT name FROM users WHERE id = ${req.userId}`;
      const endNotif = await createNotification(booking.owner_id, 'walk_completed', 'Walk Completed', `${sitterUser.name} has completed the walk.`, { booking_id: Number(req.params.bookingId) });
      io.to(String(booking.owner_id)).emit('notification', endNotif);

      // Schedule delayed payout for sitter
      // NOTE: Payouts are currently only triggered for walk-type bookings (via walk end event).
      // This is acceptable for now since walks are the only booking type with a completion path.
      if (booking.total_price && booking.total_price > 0) {
        const delayDays = await getPayoutDelay(booking.sitter_id);
        await schedulePayoutForBooking(
          Number(req.params.bookingId),
          booking.sitter_id,
          booking.total_price,
          delayDays
        );
      }
    }

    res.status(201).json({ event });
  });

  // --- Care Summary (auto-generated from events) ---
  router.get('/walks/:bookingId/summary', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [booking] = await sql`SELECT * FROM bookings WHERE id = ${req.params.bookingId}`;
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
  });
}
