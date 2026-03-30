import type { Router } from 'express';
import type { Server } from 'socket.io';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { validate, createBookingSchema, updateBookingStatusSchema, bookingFiltersSchema, createRecurringBookingSchema } from '../validation.ts';
import { createNotification, getPreferences } from '../notifications.ts';
import { capturePayment, cancelPayment, refundPayment } from '../payments.ts';
import { calculateRefund } from '../cancellation.ts';
import { calculateBookingPrice } from '../multi-pet-pricing.ts';
import { sendEmail, buildBookingConfirmationEmail, buildBookingStatusEmail, buildSitterNewBookingEmail } from '../email.ts';
import { format as formatDate } from 'date-fns';

/**
 * Parse a time string (e.g., "14:00", "2:00 PM") into an absolute Date
 * on the given booking date. All times are computed in UTC to avoid
 * server-timezone dependency.
 */
export function parseTimeToScheduled(bookingDate: Date, timeStr: string): Date | null {
  const trimmed = timeStr.trim();

  // Try HH:MM format (from <input type="time">)
  const hhmm = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (hhmm) {
    const hours = parseInt(hhmm[1], 10);
    const minutes = parseInt(hhmm[2], 10);
    if (hours > 23 || minutes > 59) return null;
    const d = new Date(bookingDate);
    d.setUTCHours(hours, minutes, 0, 0);
    return d;
  }

  // Try 12-hour format: "2:00 PM", "11:30 am"
  const ampm = trimmed.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (ampm) {
    let hours = parseInt(ampm[1], 10);
    const minutes = parseInt(ampm[2], 10);
    if (hours < 1 || hours > 12 || minutes > 59) return null;
    const period = ampm[3].toLowerCase();
    if (period === 'pm' && hours !== 12) hours += 12;
    if (period === 'am' && hours === 12) hours = 0;
    const d = new Date(bookingDate);
    d.setUTCHours(hours, minutes, 0, 0);
    return d;
  }

  return null;
}

export default function bookingRoutes(router: Router, io: Server): void {
  // --- Today's Care Tasks (for Home page) ---
  router.get('/care-tasks/today', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      // Offset in minutes from UTC (e.g., -420 for UTC-7). Defaults to UTC.
      const rawOffset = parseInt(req.query.tzOffset as string, 10);
      const offsetMin = Number.isNaN(rawOffset) ? 0 : Math.max(-720, Math.min(840, rawOffset));
      const now = new Date();
      const localNow = new Date(now.getTime() - offsetMin * 60000);
      const startOfDay = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate()) + offsetMin * 60000).toISOString();
      const endOfDay = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate() + 1) + offsetMin * 60000).toISOString();

      const tasks = await sql`
        SELECT bct.*, p.name as pet_name, b.sitter_id, b.owner_id, b.status as booking_status
        FROM booking_care_tasks bct
        JOIN pets p ON bct.pet_id = p.id
        JOIN bookings b ON bct.booking_id = b.id
        WHERE (b.owner_id = ${req.userId} OR b.sitter_id = ${req.userId})
          AND b.status IN ('confirmed', 'in_progress')
          AND bct.scheduled_time >= ${startOfDay}
          AND bct.scheduled_time < ${endOfDay}
        ORDER BY bct.scheduled_time ASC, bct.created_at ASC
      `;
      res.json({ tasks });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch today\'s care tasks' });
    }
  });

  // --- Booking Care Tasks ---
  router.get('/bookings/:bookingId/care-tasks', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [booking] = await sql`SELECT id, owner_id, sitter_id FROM bookings WHERE id = ${req.params.bookingId}`;
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }
    if (booking.owner_id !== req.userId && booking.sitter_id !== req.userId) {
      res.status(403).json({ error: 'Not part of this booking' });
      return;
    }
    const tasks = await sql`
      SELECT bct.*, p.name as pet_name
      FROM booking_care_tasks bct
      JOIN pets p ON bct.pet_id = p.id
      WHERE bct.booking_id = ${req.params.bookingId}
      ORDER BY bct.pet_id, bct.time NULLS LAST, bct.created_at
    `;
    res.json({ tasks });
  });

  router.put('/bookings/:bookingId/care-tasks/:taskId/complete', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [booking] = await sql`SELECT id, sitter_id, status FROM bookings WHERE id = ${req.params.bookingId}`;
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }
    if (booking.status !== 'confirmed' && booking.status !== 'in_progress') {
      res.status(400).json({ error: 'Tasks can only be updated on active bookings' });
      return;
    }
    if (booking.sitter_id !== req.userId) {
      res.status(403).json({ error: 'Only the sitter can complete tasks' });
      return;
    }
    const [task] = await sql`SELECT id FROM booking_care_tasks WHERE id = ${req.params.taskId} AND booking_id = ${req.params.bookingId}`;
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    const [updated] = await sql`
      UPDATE booking_care_tasks SET completed = TRUE, completed_at = NOW()
      WHERE id = ${req.params.taskId}
      RETURNING *
    `;
    res.json({ task: updated });
  });

  router.put('/bookings/:bookingId/care-tasks/:taskId/uncomplete', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [booking] = await sql`SELECT id, sitter_id, status FROM bookings WHERE id = ${req.params.bookingId}`;
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }
    if (booking.status !== 'confirmed' && booking.status !== 'in_progress') {
      res.status(400).json({ error: 'Tasks can only be updated on active bookings' });
      return;
    }
    if (booking.sitter_id !== req.userId) {
      res.status(403).json({ error: 'Only the sitter can update tasks' });
      return;
    }
    const [task] = await sql`SELECT id FROM booking_care_tasks WHERE id = ${req.params.taskId} AND booking_id = ${req.params.bookingId}`;
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    const [updated] = await sql`
      UPDATE booking_care_tasks SET completed = FALSE, completed_at = NULL
      WHERE id = ${req.params.taskId}
      RETURNING *
    `;
    res.json({ task: updated });
  });

  // --- Bookings ---
  router.post('/bookings', authMiddleware, validate(createBookingSchema), async (req: AuthenticatedRequest, res) => {
    const { sitter_id, service_id, pet_ids, start_time, end_time } = req.body;

    const startMs = new Date(start_time).getTime();
    const endMs = new Date(end_time).getTime();
    if (startMs < Date.now()) {
      res.status(400).json({ error: 'Cannot book in the past' });
      return;
    }
    const durationMs = endMs - startMs;
    const MAX_DURATION_MS = 24 * 60 * 60 * 1000;
    if (durationMs > MAX_DURATION_MS) {
      res.status(400).json({ error: 'Booking duration cannot exceed 24 hours' });
      return;
    }
    if (Number(sitter_id) === req.userId) {
      res.status(400).json({ error: 'Cannot book yourself' });
      return;
    }
    const [sitterUser] = await sql`SELECT approval_status FROM users WHERE id = ${sitter_id}`;
    if (!sitterUser || sitterUser.approval_status !== 'approved') {
      res.status(400).json({ error: 'This sitter is not currently available for bookings' });
      return;
    }
    const [service] = await sql`SELECT id, price, type, additional_pet_price FROM services WHERE id = ${service_id} AND sitter_id = ${sitter_id}`;
    if (!service) {
      res.status(400).json({ error: 'Invalid service for this sitter' });
      return;
    }

    const totalPrice = calculateBookingPrice(service.price, service.additional_pet_price || 0, pet_ids.length);

    // Use transaction for booking + booking_pets + care tasks
    let booking;
    try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    booking = await sql.begin(async (tx: any) => {
      // Verify all pets belong to the owner (inside transaction for consistency)
      const ownerPets = await tx`SELECT id FROM pets WHERE id = ANY(${pet_ids}) AND owner_id = ${req.userId}`;
      if (ownerPets.length !== pet_ids.length) {
        throw new Error('INVALID_PETS');
      }

      const [b] = await tx`
        INSERT INTO bookings (sitter_id, owner_id, service_id, start_time, end_time, total_price, status)
        VALUES (${sitter_id}, ${req.userId}, ${service_id}, ${start_time}, ${end_time}, ${totalPrice}, 'pending')
        RETURNING id, status
      `;
      const petRows = pet_ids.map((petId: number) => ({ booking_id: b.id, pet_id: petId }));
      await tx`INSERT INTO booking_pets ${tx(petRows, 'booking_id', 'pet_id')}`;

      // Auto-populate care tasks from pet care instructions (inside transaction)
      const petsWithCare = await tx`SELECT id, care_instructions FROM pets WHERE id = ANY(${pet_ids}) AND care_instructions IS NOT NULL AND care_instructions != '[]'::jsonb`;
      const taskRows: { booking_id: number; pet_id: number; category: string; description: string; time: string | null; notes: string | null; scheduled_time: string | null }[] = [];
      const bookingDate = new Date(start_time);
      for (const pet of petsWithCare) {
        const raw = pet.care_instructions as unknown[];
        for (const item of raw) {
          if (typeof item !== 'object' || !item || !('category' in item) || !('description' in item)) continue;
          const instr = item as { category: string; description: string; time?: string; notes?: string };
          let scheduledTime: string | null = null;
          if (instr.time) {
            const parsed = parseTimeToScheduled(bookingDate, instr.time);
            if (parsed) scheduledTime = parsed.toISOString();
          }
          taskRows.push({ booking_id: b.id, pet_id: pet.id, category: instr.category, description: instr.description, time: instr.time || null, notes: instr.notes || null, scheduled_time: scheduledTime });
        }
      }
      if (taskRows.length > 0) {
        await tx`INSERT INTO booking_care_tasks ${tx(taskRows, 'booking_id', 'pet_id', 'category', 'description', 'time', 'notes', 'scheduled_time')}`;
      }

      return b;
    });
    } catch (err) {
      if (err instanceof Error && err.message === 'INVALID_PETS') {
        res.status(400).json({ error: 'One or more pets not found or do not belong to you' });
        return;
      }
      throw err;
    }

    // Notify sitter of new booking
    const [owner] = await sql`SELECT name, email FROM users WHERE id = ${req.userId}`;
    const [sitter] = await sql`SELECT name, email FROM users WHERE id = ${sitter_id}`;
    const notification = await createNotification(sitter_id, 'new_booking', 'New Booking Request', `${owner.name} has requested a booking.`, { booking_id: booking.id });
    io.to(String(sitter_id)).emit('notification', notification);

    // Send email notifications (fire-and-forget)
    const formattedStart = formatDate(new Date(start_time), 'MMMM d, yyyy \'at\' h:mm a');
    const serviceName = service.type || 'Pet Service';
    const sitterPrefs = await getPreferences(sitter_id);
    if (sitterPrefs.email_enabled && sitterPrefs.new_booking) {
      const sitterEmail = buildSitterNewBookingEmail({ sitterName: sitter.name, ownerName: owner.name, serviceName, startTime: formattedStart, totalPrice: totalPrice });
      sendEmail({ to: sitter.email, ...sitterEmail }).catch(() => {});
    }
    const ownerPrefs = await getPreferences(req.userId!);
    if (ownerPrefs.email_enabled && ownerPrefs.new_booking) {
      const ownerEmail = buildBookingConfirmationEmail({ ownerName: owner.name, sitterName: sitter.name, serviceName, startTime: formattedStart, totalPrice: totalPrice });
      sendEmail({ to: owner.email, ...ownerEmail }).catch(() => {});
    }

    res.json({ id: booking.id, status: booking.status });
  });

  router.get('/bookings', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const parsed = bookingFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      const errors = parsed.error.issues.map((i) => i.message);
      res.status(400).json({ error: errors[0], errors });
      return;
    }
    const { start, end, status, search, limit, offset } = parsed.data;

    // Determine if the user is acting as owner or sitter for search filtering
    const [currentUser] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
    const isSitter = currentUser?.roles?.includes('sitter') ?? false;
    const isOwner = currentUser?.roles?.includes('owner') ?? true;
    const isBoth = isSitter && isOwner;

    // Count total matching rows for pagination
    const [{ count: totalCount }] = await sql`
      SELECT COUNT(*)::int AS count
      FROM bookings b
      JOIN users s ON b.sitter_id = s.id
      JOIN users o ON b.owner_id = o.id
      JOIN services svc ON b.service_id = svc.id
      WHERE (b.owner_id = ${req.userId} OR b.sitter_id = ${req.userId})
        ${start ? sql`AND b.start_time >= ${start}::timestamptz` : sql``}
        ${end ? sql`AND b.start_time < ${end}::timestamptz` : sql``}
        ${status ? sql`AND b.status = ${status}` : sql``}
        ${search
          ? isBoth
            ? sql`AND (o.name ILIKE ${'%' + search + '%'} OR s.name ILIKE ${'%' + search + '%'})`
            : isSitter
              ? sql`AND o.name ILIKE ${'%' + search + '%'}`
              : sql`AND s.name ILIKE ${'%' + search + '%'}`
          : sql``}
    `;

    const bookings = await sql`
      SELECT b.*,
             s.name as sitter_name, s.avatar_url as sitter_avatar,
             o.name as owner_name, o.avatar_url as owner_avatar,
             svc.type as service_type
      FROM bookings b
      JOIN users s ON b.sitter_id = s.id
      JOIN users o ON b.owner_id = o.id
      JOIN services svc ON b.service_id = svc.id
      WHERE (b.owner_id = ${req.userId} OR b.sitter_id = ${req.userId})
        ${start ? sql`AND b.start_time >= ${start}::timestamptz` : sql``}
        ${end ? sql`AND b.start_time < ${end}::timestamptz` : sql``}
        ${status ? sql`AND b.status = ${status}` : sql``}
        ${search
          ? isBoth
            ? sql`AND (o.name ILIKE ${'%' + search + '%'} OR s.name ILIKE ${'%' + search + '%'})`
            : isSitter
              ? sql`AND o.name ILIKE ${'%' + search + '%'}`
              : sql`AND s.name ILIKE ${'%' + search + '%'}`
          : sql``}
      ORDER BY b.start_time DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    // Batch-fetch pets for all bookings
    const bookingIds = bookings.map((b: { id: number }) => b.id);
    const bookingPets = bookingIds.length > 0
      ? await sql`
          SELECT bp.booking_id, p.id, p.name, p.photo_url, p.breed
          FROM booking_pets bp
          JOIN pets p ON bp.pet_id = p.id
          WHERE bp.booking_id = ANY(${bookingIds})
        `
      : [];
    const petsByBooking = bookingPets.reduce(
      (acc: Map<number, { id: number; name: string; photo_url: string | null; breed: string | null }[]>, row: { booking_id: number; id: number; name: string; photo_url: string | null; breed: string | null }) => {
        const existing = acc.get(row.booking_id) ?? [];
        return new Map([...acc, [row.booking_id, [...existing, { id: row.id, name: row.name, photo_url: row.photo_url, breed: row.breed }]]]);
      },
      new Map<number, { id: number; name: string; photo_url: string | null; breed: string | null }[]>(),
    );
    const enriched = bookings.map((b: { id: number }) => ({ ...b, pets: petsByBooking.get(b.id) || [] }));

    res.json({ bookings: enriched, total: totalCount });
  });

  // --- Booking Status Update ---
  router.put('/bookings/:id/status', authMiddleware, validate(updateBookingStatusSchema), async (req: AuthenticatedRequest, res) => {
    const { status } = req.body;
    const bookingId = Number(req.params.id);

    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      res.status(400).json({ error: 'Invalid booking ID' });
      return;
    }

    // Atomic update with preconditions in WHERE clause to prevent race conditions
    let updated;
    if (status === 'confirmed') {
      [updated] = await sql`
        UPDATE bookings SET status = 'confirmed'::booking_status, responded_at = COALESCE(responded_at, NOW())
        WHERE id = ${bookingId} AND sitter_id = ${req.userId} AND status = 'pending'
        RETURNING *
      `;
    } else {
      // Cancelled — sitter can cancel pending, owner can cancel pending or confirmed
      [updated] = await sql`
        UPDATE bookings SET status = 'cancelled'::booking_status, responded_at = COALESCE(responded_at, NOW())
        WHERE id = ${bookingId}
          AND (
            (sitter_id = ${req.userId} AND status = 'pending')
            OR (owner_id = ${req.userId} AND status IN ('pending', 'confirmed'))
          )
        RETURNING *
      `;
    }

    if (!updated) {
      // Determine the specific error
      const [booking] = await sql`SELECT * FROM bookings WHERE id = ${bookingId}`;
      if (!booking) {
        res.status(404).json({ error: 'Booking not found' });
        return;
      }
      if (booking.sitter_id !== req.userId && booking.owner_id !== req.userId) {
        res.status(403).json({ error: 'Not authorized to update this booking' });
        return;
      }
      res.status(409).json({ error: 'Booking status cannot be changed. It may have been updated already.' });
      return;
    }

    // Notifications are best-effort — don't fail the request if they error
    try {
      const isSitter = updated.sitter_id === req.userId;
      const [actingUser] = await sql`SELECT name FROM users WHERE id = ${req.userId}`;
      const otherUserId = isSitter ? updated.owner_id : updated.sitter_id;

      const title = status === 'confirmed' ? 'Booking Confirmed'
        : isSitter ? 'Booking Declined' : 'Booking Cancelled';
      const body = status === 'confirmed'
        ? `${actingUser.name} has confirmed your booking.`
        : isSitter
          ? `${actingUser.name} has declined your booking request.`
          : `${actingUser.name} has cancelled the booking.`;

      const notification = await createNotification(
        otherUserId, 'booking_status', title, body, { booking_id: bookingId }
      );
      io.to(String(otherUserId)).emit('notification', notification);

      // Send email notification for status change
      const [otherUser] = await sql`SELECT name, email FROM users WHERE id = ${otherUserId}`;
      const otherPrefs = await getPreferences(otherUserId);
      if (otherPrefs.email_enabled && otherPrefs.booking_status) {
        const [svc] = await sql`SELECT type FROM services WHERE id = ${updated.service_id}`;
        const statusEmail = buildBookingStatusEmail({
          recipientName: otherUser.name,
          otherPartyName: actingUser.name,
          status: status as 'confirmed' | 'cancelled',
          serviceName: svc?.type || 'Pet Service',
          startTime: formatDate(new Date(updated.start_time), 'MMMM d, yyyy \'at\' h:mm a'),
        });
        sendEmail({ to: otherUser.email, ...statusEmail }).catch(() => {});
      }
    } catch {
      // Notification failed — booking status was already updated successfully
    }

    // Calculate refund for owner-initiated cancellations of confirmed bookings with held payments
    let refund = null;
    if (status === 'cancelled' && updated.owner_id === req.userId && updated.payment_status === 'held' && updated.payment_intent_id) {
      try {
        const [sitter] = await sql`SELECT cancellation_policy FROM users WHERE id = ${updated.sitter_id}`;
        const policy = sitter.cancellation_policy || 'flexible';
        refund = calculateRefund(policy, Math.round((updated.total_price || 0) * 100), new Date(updated.start_time), new Date());

        if (refund.refundAmount > 0) {
          await refundPayment(updated.payment_intent_id, refund.refundAmount);
          await sql`UPDATE bookings SET payment_status = 'cancelled' WHERE id = ${bookingId}`;
        } else {
          // No refund — sitter keeps the full amount
          await capturePayment(updated.payment_intent_id);
          await sql`UPDATE bookings SET payment_status = 'captured' WHERE id = ${bookingId}`;
        }
      } catch (err) {
        console.error(`Refund failed for booking ${bookingId}:`, err);
        refund = null; // Don't send misleading refund info to client
      }
    } else if (status === 'cancelled' && updated.payment_intent_id && updated.payment_status === 'held') {
      // Sitter-initiated cancellation of pending booking — full refund
      try {
        await cancelPayment(updated.payment_intent_id);
        await sql`UPDATE bookings SET payment_status = 'cancelled' WHERE id = ${bookingId}`;
      } catch (err) {
        console.error(`Payment cancellation failed for booking ${bookingId}:`, err);
      }
    }

    res.json({ booking: updated, refund });
  });

  // --- Recurring Bookings ---
  router.get('/recurring-bookings', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const recurring = await sql`
      SELECT rb.*, u.name as sitter_name, s.type as service_type
      FROM recurring_bookings rb
      JOIN users u ON rb.sitter_id = u.id
      JOIN services s ON rb.service_id = s.id
      WHERE rb.owner_id = ${req.userId}
      ORDER BY rb.created_at DESC
    `;
    res.json({ recurring_bookings: recurring });
  });

  router.post('/recurring-bookings', authMiddleware, validate(createRecurringBookingSchema), async (req: AuthenticatedRequest, res) => {
    const { sitter_id, service_id, pet_ids, frequency, day_of_week, start_time, end_time } = req.body;

    if (Number(sitter_id) === req.userId) {
      res.status(400).json({ error: 'Cannot create recurring booking with yourself' });
      return;
    }

    const [service] = await sql`SELECT id FROM services WHERE id = ${service_id} AND sitter_id = ${sitter_id}`;
    if (!service) {
      res.status(400).json({ error: 'Invalid service for this sitter' });
      return;
    }

    const ownerPets = await sql`SELECT id FROM pets WHERE id = ANY(${pet_ids}) AND owner_id = ${req.userId}`;
    if (ownerPets.length !== pet_ids.length) {
      res.status(400).json({ error: 'One or more pets not found' });
      return;
    }

    // Calculate next occurrence
    const now = new Date();
    const today = now.getDay();
    let daysUntil = day_of_week - today;
    if (daysUntil <= 0) daysUntil += 7;
    const nextDate = new Date(now);
    nextDate.setDate(now.getDate() + daysUntil);
    const nextOccurrence = nextDate.toISOString().split('T')[0];

    const [recurring] = await sql`
      INSERT INTO recurring_bookings (owner_id, sitter_id, service_id, pet_ids, frequency, day_of_week, start_time, end_time, next_occurrence)
      VALUES (${req.userId}, ${sitter_id}, ${service_id}, ${pet_ids}, ${frequency}, ${day_of_week}, ${start_time}, ${end_time}, ${nextOccurrence})
      RETURNING *
    `;
    res.status(201).json({ recurring_booking: recurring });
  });

  router.put('/recurring-bookings/:id/pause', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [rb] = await sql`SELECT id FROM recurring_bookings WHERE id = ${req.params.id} AND owner_id = ${req.userId}`;
    if (!rb) {
      res.status(404).json({ error: 'Recurring booking not found' });
      return;
    }
    const [updated] = await sql`UPDATE recurring_bookings SET active = FALSE WHERE id = ${req.params.id} RETURNING *`;
    res.json({ recurring_booking: updated });
  });

  router.put('/recurring-bookings/:id/resume', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [rb] = await sql`SELECT id FROM recurring_bookings WHERE id = ${req.params.id} AND owner_id = ${req.userId}`;
    if (!rb) {
      res.status(404).json({ error: 'Recurring booking not found' });
      return;
    }
    const [updated] = await sql`UPDATE recurring_bookings SET active = TRUE WHERE id = ${req.params.id} RETURNING *`;
    res.json({ recurring_booking: updated });
  });

  router.delete('/recurring-bookings/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [rb] = await sql`SELECT id FROM recurring_bookings WHERE id = ${req.params.id} AND owner_id = ${req.userId}`;
    if (!rb) {
      res.status(404).json({ error: 'Recurring booking not found' });
      return;
    }
    await sql`DELETE FROM recurring_bookings WHERE id = ${req.params.id}`;
    res.json({ success: true });
  });
}
