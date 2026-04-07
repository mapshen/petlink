import type { Router } from 'express';
import type { Server } from 'socket.io';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { validate, createBookingSchema, updateBookingStatusSchema, bookingFiltersSchema, createRecurringBookingSchema } from '../validation.ts';
import { createNotification, getPreferences } from '../notifications.ts';
import { capturePayment, cancelPayment, refundPayment } from '../payments.ts';
import { calculateRefund } from '../cancellation.ts';
import { calculateBookingPrice, calculateAdvancedPrice, calculateStayDuration, isUSHoliday, isPuppy } from '../../shared/pricing.ts';
import { findApplicableTier, calculateLoyaltyDiscount } from '../../shared/loyalty-discount.ts';
import { getAddonBySlug } from '../../shared/addon-catalog.ts';
import { sendEmail, buildBookingConfirmationEmail, buildBookingStatusEmail, buildSitterNewBookingEmail } from '../email.ts';
import { recordStrike, evaluateConsequences, getStrikeEventForCancellation } from '../reliability.ts';
import { shouldTriggerProtection, triggerReservationProtection, findReplacementSitters } from '../reservation-protection.ts';
import { generateBackupsForBooking } from '../backup-sitters.ts';
import logger, { sanitizeError } from '../logger.ts';
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
    const bookingId = Number(req.params.bookingId);
    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      res.status(400).json({ error: 'Invalid booking ID' });
      return;
    }
    const [booking] = await sql`SELECT id, owner_id, sitter_id FROM bookings WHERE id = ${bookingId}`;
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
      WHERE bct.booking_id = ${bookingId}
      ORDER BY bct.pet_id, bct.time NULLS LAST, bct.created_at
    `;
    res.json({ tasks });
  });

  router.put('/bookings/:bookingId/care-tasks/:taskId/complete', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const bookingId = Number(req.params.bookingId);
    const taskId = Number(req.params.taskId);
    if (!Number.isInteger(bookingId) || bookingId <= 0 || !Number.isInteger(taskId) || taskId <= 0) {
      res.status(400).json({ error: 'Invalid booking or task ID' });
      return;
    }
    const [booking] = await sql`SELECT id, sitter_id, status FROM bookings WHERE id = ${bookingId}`;
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
    const [task] = await sql`SELECT id FROM booking_care_tasks WHERE id = ${taskId} AND booking_id = ${bookingId}`;
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    const [updated] = await sql`
      UPDATE booking_care_tasks SET completed = TRUE, completed_at = NOW()
      WHERE id = ${taskId}
      RETURNING *
    `;
    res.json({ task: updated });
  });

  router.put('/bookings/:bookingId/care-tasks/:taskId/uncomplete', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const bookingId = Number(req.params.bookingId);
    const taskId = Number(req.params.taskId);
    if (!Number.isInteger(bookingId) || bookingId <= 0 || !Number.isInteger(taskId) || taskId <= 0) {
      res.status(400).json({ error: 'Invalid booking or task ID' });
      return;
    }
    const [booking] = await sql`SELECT id, sitter_id, status FROM bookings WHERE id = ${bookingId}`;
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
    const [task] = await sql`SELECT id FROM booking_care_tasks WHERE id = ${taskId} AND booking_id = ${bookingId}`;
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    const [updated] = await sql`
      UPDATE booking_care_tasks SET completed = FALSE, completed_at = NULL
      WHERE id = ${taskId}
      RETURNING *
    `;
    res.json({ task: updated });
  });

  // --- Bookings ---
  router.post('/bookings', authMiddleware, validate(createBookingSchema), async (req: AuthenticatedRequest, res) => {
    const { sitter_id, service_id, pet_ids, start_time, end_time, pickup_dropoff, grooming_addon, addon_ids } = req.body;

    const startMs = new Date(start_time).getTime();
    const endMs = new Date(end_time).getTime();
    if (startMs < Date.now()) {
      res.status(400).json({ error: 'Cannot book in the past' });
      return;
    }
    const durationMs = endMs - startMs;
    // Duration cap is checked after service lookup (extended services get 30-day cap)
    if (Number(sitter_id) === req.userId) {
      res.status(400).json({ error: 'Cannot book yourself' });
      return;
    }
    const [sitterUser] = await sql`SELECT approval_status, stripe_payouts_enabled, stripe_charges_enabled FROM users WHERE id = ${sitter_id}`;
    if (!sitterUser || sitterUser.approval_status !== 'approved') {
      res.status(400).json({ error: 'This sitter is not currently available for bookings' });
      return;
    }
    if (!sitterUser.stripe_payouts_enabled || !sitterUser.stripe_charges_enabled) {
      res.status(400).json({ error: 'This sitter has not completed payout setup and cannot accept bookings yet' });
      return;
    }
    const [service] = await sql`SELECT id, price_cents, type, additional_pet_price_cents, max_pets, holiday_rate_cents, puppy_rate_cents, pickup_dropoff_fee_cents, grooming_addon_fee_cents, nightly_rate_cents, half_day_rate_cents FROM services WHERE id = ${service_id} AND sitter_id = ${sitter_id}`;
    if (!service) {
      res.status(400).json({ error: 'Invalid service for this sitter' });
      return;
    }

    // Duration cap: extended services (sitting/daycare) get 30-day cap, others get 24h
    const isExtendedService = service.type === 'sitting' || service.type === 'daycare';
    const MAX_DURATION_MS = isExtendedService ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    if (durationMs > MAX_DURATION_MS) {
      res.status(400).json({
        error: isExtendedService
          ? 'Sitting/daycare bookings cannot exceed 30 days'
          : 'Booking duration cannot exceed 24 hours',
      });
      return;
    }

    if (pet_ids.length > (service.max_pets || 1)) {
      res.status(400).json({ error: `This service accepts a maximum of ${service.max_pets || 1} pets` });
      return;
    }

    // Validate and fetch selected add-ons
    let selectedAddons: { id: number; addon_slug: string; price_cents: number }[] = [];
    if (addon_ids && addon_ids.length > 0) {
      selectedAddons = await sql`
        SELECT id, addon_slug, price_cents FROM sitter_addons
        WHERE id = ANY(${addon_ids}) AND sitter_id = ${sitter_id}
      `;
      if (selectedAddons.length !== addon_ids.length) {
        res.status(400).json({ error: 'One or more add-ons are invalid or do not belong to this sitter' });
        return;
      }
      // Validate add-ons are applicable to the booked service type
      for (const addon of selectedAddons) {
        const def = getAddonBySlug(addon.addon_slug);
        if (!def || !def.applicableServices.includes(service.type as any)) {
          res.status(400).json({ error: `Add-on "${addon.addon_slug}" is not available for ${service.type} service` });
          return;
        }
      }
    }

    // Check for holiday/puppy pricing
    const bookingDate = new Date(start_time);
    const bookedPets = await sql`SELECT age FROM pets WHERE id = ANY(${pet_ids})`;
    const hasPuppyPet = bookedPets.some((p: { age: number | null }) => isPuppy(p.age ?? undefined));

    // Calculate stay duration for extended services
    const stayDuration = isExtendedService
      ? calculateStayDuration(new Date(start_time), new Date(end_time))
      : { nights: 0, halfDays: 0 };

    // Loyalty discount: count completed bookings between owner and sitter
    const loyaltyTiers = await sql`
      SELECT min_bookings, discount_percent
      FROM loyalty_discounts
      WHERE sitter_id = ${sitter_id}
      ORDER BY min_bookings ASC
    `;
    const [{ count: completedCount }] = await sql`
      SELECT COUNT(*)::int as count FROM bookings
      WHERE owner_id = ${req.userId} AND sitter_id = ${sitter_id} AND status = 'completed'
    `;
    const applicableTier = findApplicableTier(
      loyaltyTiers.map((t: { min_bookings: number; discount_percent: number }) => ({
        sitter_id: Number(sitter_id),
        min_bookings: t.min_bookings,
        discount_percent: t.discount_percent,
      })),
      completedCount
    );
    const discountPercent = applicableTier?.discount_percent;
    const discountReason = applicableTier
      ? `Loyalty discount: ${applicableTier.discount_percent}% off (${completedCount}+ bookings)`
      : undefined;

    const pricing = calculateAdvancedPrice({
      basePriceCents: service.price_cents,
      additionalPetPriceCents: service.additional_pet_price_cents || 0,
      petCount: pet_ids.length,
      isHoliday: isUSHoliday(bookingDate),
      holidayRateCents: service.holiday_rate_cents,
      hasPuppy: hasPuppyPet,
      puppyRateCents: service.puppy_rate_cents,
      pickupDropoff: pickup_dropoff,
      pickupDropoffFeeCents: service.pickup_dropoff_fee_cents,
      groomingAddon: grooming_addon,
      groomingAddonFeeCents: service.grooming_addon_fee_cents,
      addons: selectedAddons.map((a) => ({ slug: a.addon_slug, priceCents: a.price_cents })),
      nights: stayDuration.nights,
      halfDays: stayDuration.halfDays,
      nightlyRateCents: service.nightly_rate_cents ?? undefined,
      halfDayRateCents: service.half_day_rate_cents ?? undefined,
      serviceType: service.type,
      discountPercent,
      discountReason,
    });
    const totalPrice = pricing.totalCents;
    const bookingNights = stayDuration.nights;
    const bookingHalfDays = stayDuration.halfDays;
    const isExtendedStay = isExtendedService && (bookingNights > 0 || bookingHalfDays > 0);
    const bookingDiscountPct = pricing.breakdown.discountPercent || null;
    const bookingDiscountReason = pricing.breakdown.discountReason || null;

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

      // Advisory lock on sitter_id serializes concurrent bookings for the same sitter
      await tx`SELECT pg_advisory_xact_lock(${sitter_id})`;

      // Prevent double-booking: check for overlapping bookings for this sitter
      const [overlap] = await tx`
        SELECT id FROM bookings
        WHERE sitter_id = ${sitter_id}
          AND status IN ('pending', 'confirmed', 'in_progress')
          AND start_time < ${end_time}::timestamptz
          AND end_time > ${start_time}::timestamptz
        LIMIT 1
      `;
      if (overlap) {
        throw new Error('SITTER_UNAVAILABLE');
      }

      // Check for available deposit credit from a completed meet & greet
      const isMeetGreet = service.type === 'meet_greet';
      const creditCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      let creditApplied = 0;
      let creditBookingId: number | null = null;
      if (!isMeetGreet) {
        const [availableCredit] = await tx`
          SELECT id, total_price_cents FROM bookings
          WHERE owner_id = ${req.userId} AND sitter_id = ${sitter_id}
            AND status = 'completed' AND deposit_status = 'captured_as_deposit'
            AND end_time > ${creditCutoff}::timestamptz
          ORDER BY end_time DESC LIMIT 1
          FOR UPDATE
        `;
        if (availableCredit) {
          creditApplied = Math.min(availableCredit.total_price_cents, totalPrice);
          creditBookingId = availableCredit.id;
        }
      }

      const [b] = await tx`
        INSERT INTO bookings (sitter_id, owner_id, service_id, start_time, end_time, total_price_cents, status, deposit_status, nights, half_days, is_extended_stay, discount_pct, discount_reason)
        VALUES (${sitter_id}, ${req.userId}, ${service_id}, ${start_time}, ${end_time}, ${totalPrice}, 'pending', ${isMeetGreet ? 'held' : null}, ${isExtendedStay ? bookingNights : null}, ${isExtendedStay ? bookingHalfDays : null}, ${isExtendedStay}, ${bookingDiscountPct}, ${bookingDiscountReason})
        RETURNING id, status, deposit_status
      `;

      // Apply credit: mark the meet & greet deposit as applied + refund to owner
      if (creditBookingId && creditApplied > 0) {
        await tx`
          UPDATE bookings SET deposit_status = 'applied', deposit_applied_to_booking_id = ${b.id}
          WHERE id = ${creditBookingId} AND deposit_status = 'captured_as_deposit'
        `;
        // Refund the credit amount to the owner (the deposit was already captured)
        const [meetGreetBooking] = await tx`SELECT payment_intent_id FROM bookings WHERE id = ${creditBookingId}`;
        if (meetGreetBooking?.payment_intent_id) {
          // Fire-and-forget refund — the credit amount goes back to the owner's card
          refundPayment(meetGreetBooking.payment_intent_id, creditApplied).catch((err: unknown) => {
            logger.error({ err: sanitizeError(err as Error), bookingId: creditBookingId }, 'Failed to refund deposit credit');
          });
        }
      }
      const petRows = pet_ids.map((petId: number) => ({ booking_id: b.id, pet_id: petId }));
      await tx`INSERT INTO booking_pets ${tx(petRows, 'booking_id', 'pet_id')}`;

      // Insert selected add-ons (snapshot price at booking time)
      if (selectedAddons.length > 0) {
        const addonRows = selectedAddons.map((a) => ({ booking_id: b.id, addon_id: a.id, addon_slug: a.addon_slug, price_cents: a.price_cents }));
        await tx`INSERT INTO booking_addons ${tx(addonRows, 'booking_id', 'addon_id', 'addon_slug', 'price_cents')}`;
      }

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
      if (err instanceof Error && err.message === 'SITTER_UNAVAILABLE') {
        res.status(409).json({ error: 'This sitter already has a booking during the selected time' });
        return;
      }
      throw err;
    }

    // Notify sitter of new booking
    const [owner] = await sql`SELECT name, email FROM users WHERE id = ${req.userId}`;
    const [sitter] = await sql`SELECT name, email FROM users WHERE id = ${sitter_id}`;
    const notification = await createNotification(sitter_id, 'new_booking', 'New Booking Request', `${owner.name} has requested a booking.`, { booking_id: booking.id });
    if (notification) io.to(String(sitter_id)).emit('notification', notification);

    // Send email notifications (fire-and-forget)
    const formattedStart = formatDate(new Date(start_time), 'MMMM d, yyyy \'at\' h:mm a');
    const serviceName = service.type || 'Pet Service';
    const sitterPrefs = await getPreferences(sitter_id);
    if (sitterPrefs.email_enabled && sitterPrefs.new_booking) {
      const sitterEmail = buildSitterNewBookingEmail({ sitterName: sitter.name, ownerName: owner.name, serviceName, startTime: formattedStart, totalPriceCents: totalPrice });
      sendEmail({ to: sitter.email, ...sitterEmail }).catch(() => {});
    }
    const ownerPrefs = await getPreferences(req.userId!);
    if (ownerPrefs.email_enabled && ownerPrefs.new_booking) {
      const ownerEmail = buildBookingConfirmationEmail({ ownerName: owner.name, sitterName: sitter.name, serviceName, startTime: formattedStart, totalPriceCents: totalPrice });
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
      LEFT JOIN services svc ON b.service_id = svc.id
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
             s.name as sitter_name, s.avatar_url as sitter_avatar, s.camera_preference as sitter_camera_preference,
             o.name as owner_name, o.avatar_url as owner_avatar, o.has_cameras as owner_has_cameras, o.camera_locations as owner_camera_locations, o.camera_policy_note as owner_camera_policy_note,
             svc.type as service_type
      FROM bookings b
      JOIN users s ON b.sitter_id = s.id
      JOIN users o ON b.owner_id = o.id
      LEFT JOIN services svc ON b.service_id = svc.id
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
    // Batch-fetch add-ons for all bookings
    const bookingAddons = bookingIds.length > 0
      ? await sql`
          SELECT booking_id, addon_id, addon_slug, price_cents
          FROM booking_addons
          WHERE booking_id = ANY(${bookingIds})
        `
      : [];
    const addonsByBooking = new Map<number, { addon_id: number | null; addon_slug: string; price_cents: number }[]>();
    for (const row of bookingAddons) {
      const existing = addonsByBooking.get(row.booking_id) ?? [];
      existing.push({ addon_id: row.addon_id, addon_slug: row.addon_slug, price_cents: row.price_cents });
      addonsByBooking.set(row.booking_id, existing);
    }

    // Batch-fetch pet flag counts for sitters (aggregate across all sitters for safety signal)
    const allPetIds = [...new Set(bookingPets.map((p: { id: number }) => p.id))];
    const petFlagCounts = isSitter && allPetIds.length > 0
      ? new Map(
          (await sql`
            SELECT pet_id, COUNT(*)::int as flag_count
            FROM private_pet_notes
            WHERE pet_id = ANY(${allPetIds}) AND flags != '{}'
            GROUP BY pet_id
          `.catch(() => [] as any[])).map((row: { pet_id: number; flag_count: number }) => [row.pet_id, row.flag_count] as const)
        )
      : new Map<number, number>();

    const enriched = bookings.map((b: { id: number; sitter_id: number; payment_intent_id?: string }) => {
      const { payment_intent_id: _pid, ...safe } = b;
      const pets = (petsByBooking.get(b.id) || []).map((p: { id: number; name: string; photo_url: string | null; breed: string | null }) => ({
        ...p,
        ...(isSitter && b.sitter_id === req.userId ? { pet_flag_count: petFlagCounts.get(p.id) || 0 } : {}),
      }));
      return { ...safe, pets, addons: addonsByBooking.get(b.id) || [] };
    });

    res.json({ bookings: enriched, total: totalCount });
  });

  // --- Booking Status Update ---
  router.put('/bookings/:id/status', authMiddleware, validate(updateBookingStatusSchema), async (req: AuthenticatedRequest, res) => {
    const { status, custom_price_cents } = req.body;
    const bookingId = Number(req.params.id);

    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      res.status(400).json({ error: 'Invalid booking ID' });
      return;
    }

    // Atomic update with preconditions in WHERE clause to prevent race conditions
    let updated;
    if (status === 'confirmed') {
      // Sitter can optionally set a custom price when confirming
      if (custom_price_cents != null) {
        [updated] = await sql`
          UPDATE bookings SET status = 'confirmed'::booking_status, responded_at = COALESCE(responded_at, NOW()),
            custom_price_cents = ${custom_price_cents},
            total_price_cents = ${custom_price_cents}
          WHERE id = ${bookingId} AND sitter_id = ${req.userId} AND status = 'pending'
          RETURNING *
        `;
      } else {
        [updated] = await sql`
          UPDATE bookings SET status = 'confirmed'::booking_status, responded_at = COALESCE(responded_at, NOW())
          WHERE id = ${bookingId} AND sitter_id = ${req.userId} AND status = 'pending'
          RETURNING *
        `;
      }
    } else {
      // Cancelled — sitter can cancel pending or confirmed, owner can cancel pending or confirmed
      [updated] = await sql`
        UPDATE bookings SET status = 'cancelled'::booking_status, responded_at = COALESCE(responded_at, NOW()),
          cancelled_by = CASE WHEN sitter_id = ${req.userId} THEN 'sitter' ELSE 'owner' END,
          cancelled_at = NOW()
        WHERE id = ${bookingId}
          AND (
            (sitter_id = ${req.userId} AND status IN ('pending', 'confirmed'))
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
      if (notification) io.to(String(otherUserId)).emit('notification', notification);

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

    // Auto-generate backup sitter suggestions on confirmation (async, non-blocking)
    if (status === 'confirmed') {
      generateBackupsForBooking(bookingId).catch((err: unknown) => {
        logger.error({ err: sanitizeError(err), bookingId }, 'Failed to auto-generate backup sitters');
      });
    }

    // Calculate refund for owner-initiated cancellations of confirmed bookings with held payments
    let refund = null;
    if (status === 'cancelled' && updated.owner_id === req.userId && updated.payment_status === 'held' && updated.payment_intent_id) {
      try {
        const [sitter] = await sql`SELECT cancellation_policy FROM users WHERE id = ${updated.sitter_id}`;
        const policy = sitter.cancellation_policy || 'flexible';
        const totalCents = updated.total_price_cents || 0;
        refund = calculateRefund(policy, totalCents, new Date(updated.start_time), new Date());

        if (refund.refundPercent === 100) {
          // Full refund on uncaptured payment — cancel the hold
          await cancelPayment(updated.payment_intent_id);
          await sql`UPDATE bookings SET payment_status = 'cancelled' WHERE id = ${bookingId}`;
        } else if (refund.refundAmount > 0) {
          // Partial refund on uncaptured payment — capture only the non-refundable portion
          const captureAmount = totalCents - refund.refundAmount;
          if (captureAmount <= 0) {
            // Rounding edge case: refund equals total, treat as full refund
            await cancelPayment(updated.payment_intent_id);
            await sql`UPDATE bookings SET payment_status = 'cancelled' WHERE id = ${bookingId}`;
          } else {
            await capturePayment(updated.payment_intent_id, captureAmount);
            await sql`UPDATE bookings SET payment_status = 'captured' WHERE id = ${bookingId}`;
          }
        } else {
          // No refund — sitter keeps the full amount, capture it
          await capturePayment(updated.payment_intent_id);
          await sql`UPDATE bookings SET payment_status = 'captured' WHERE id = ${bookingId}`;
        }

        // refundAmount is already in cents — no conversion needed
      } catch (err) {
        logger.error({ err: sanitizeError(err), bookingId }, 'Refund failed for booking');
        refund = null; // Don't send misleading refund info to client
      }
    } else if (status === 'cancelled' && updated.payment_intent_id && updated.payment_status === 'held') {
      // Sitter-initiated cancellation — full refund (cancel the hold)
      try {
        await cancelPayment(updated.payment_intent_id);
        await sql`UPDATE bookings SET payment_status = 'cancelled' WHERE id = ${bookingId}`;
      } catch (err) {
        logger.error({ err: sanitizeError(err), bookingId }, 'Payment cancellation failed for booking');
      }
    }

    // Update deposit_status for cancelled meet & greet bookings
    if (updated.deposit_status === 'held' && status === 'cancelled') {
      const isSitterCancel = updated.sitter_id === req.userId;
      await sql`
        UPDATE bookings SET deposit_status = ${isSitterCancel ? 'refunded' : 'released_to_sitter'}
        WHERE id = ${bookingId}
      `;
    }

    // Record reliability strike for sitter-initiated cancellations (in transaction)
    if (status === 'cancelled' && updated.sitter_id === req.userId) {
      try {
        const strikeEvent = getStrikeEventForCancellation(new Date(updated.start_time), new Date());
        if (strikeEvent) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await sql.begin(async (tx: any) => {
            await recordStrike(updated.sitter_id, strikeEvent, `Sitter cancelled booking #${bookingId}`, bookingId, tx);
            await evaluateConsequences(updated.sitter_id, tx);
          });
        }
      } catch (err) {
        logger.error({ err: sanitizeError(err), bookingId }, 'Failed to record reliability strike');
      }
    }

    // Trigger reservation protection for sitter-cancelled confirmed bookings (async, non-blocking)
    // payment_intent_id is set when payment is created for a confirmed booking — safe proxy for
    // "was confirmed" since pending bookings don't have payment intents in our flow
    if (status === 'cancelled' && updated.sitter_id === req.userId && updated.payment_intent_id) {
      if (shouldTriggerProtection('confirmed', new Date(updated.start_time))) {
        triggerReservationProtection(updated).catch((err: unknown) => {
          logger.error({ err: sanitizeError(err), bookingId }, 'Failed to trigger reservation protection');
        });
      }
    }

    // Strip payment_intent_id from response
    const { payment_intent_id: _pid, ...safeBooking } = updated;
    res.json({ booking: safeBooking, refund });
  });

  // --- Reservation Protection ---
  router.get('/bookings/:id/protection', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const bookingId = Number(req.params.id);
      if (!Number.isInteger(bookingId) || bookingId <= 0) {
        res.status(400).json({ error: 'Invalid booking ID' });
        return;
      }

      const [protection] = await sql`
        SELECT rp.*, u.name as original_sitter_name
        FROM reservation_protections rp
        JOIN users u ON u.id = rp.original_sitter_id
        WHERE rp.booking_id = ${bookingId} AND rp.owner_id = ${req.userId}
      `;
      if (!protection) {
        res.status(404).json({ error: 'No reservation protection found for this booking' });
        return;
      }

      // Fetch replacement sitter options if status is options_sent
      let replacementSitters: any[] = [];
      if (protection.status === 'options_sent') {
        const [booking] = await sql`SELECT service_id FROM bookings WHERE id = ${bookingId}`;
        const [service] = await sql`SELECT type FROM services WHERE id = ${booking?.service_id}`;
        const [originalSitter] = await sql`SELECT lat, lng FROM users WHERE id = ${protection.original_sitter_id}`;

        if (service && originalSitter?.lat && originalSitter?.lng) {
          replacementSitters = await findReplacementSitters(
            protection.original_sitter_id, service.type, originalSitter.lat, originalSitter.lng
          );
        }
      }

      res.json({ protection, replacement_sitters: replacementSitters });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch reservation protection');
      res.status(500).json({ error: 'Failed to fetch reservation protection' });
    }
  });

  // --- Meet & Greet Deposit Credit ---
  router.get('/bookings/available-credit/:sitterId', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const sitterId = Number(req.params.sitterId);
    if (!Number.isInteger(sitterId) || sitterId <= 0) {
      res.status(400).json({ error: 'Invalid sitter ID' });
      return;
    }

    const creditCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const [credit] = await sql`
      SELECT id, total_price_cents FROM bookings
      WHERE owner_id = ${req.userId} AND sitter_id = ${sitterId}
        AND status = 'completed' AND deposit_status = 'captured_as_deposit'
        AND end_time > ${creditCutoff}::timestamptz
      ORDER BY end_time DESC LIMIT 1
    `;

    res.json({ credit: credit ? { booking_id: credit.id, amount_cents: credit.total_price_cents } : null });
  });

  // --- Meet & Greet Notes ---
  router.put('/bookings/:bookingId/meet-greet-notes', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const bookingId = Number(req.params.bookingId);
      const { notes } = req.body;

      const trimmedNotes = typeof notes === 'string' ? notes.trim() : '';
      if (!trimmedNotes || trimmedNotes.length > 2000) {
        res.status(400).json({ error: 'Notes must be a string under 2000 characters' });
        return;
      }

      const [booking] = await sql`SELECT id, sitter_id, status FROM bookings WHERE id = ${bookingId}`;
      if (!booking) {
        res.status(404).json({ error: 'Booking not found' });
        return;
      }
      if (booking.sitter_id !== req.userId) {
        res.status(403).json({ error: 'Only the sitter can add notes' });
        return;
      }
      if (booking.status !== 'completed') {
        res.status(400).json({ error: 'Can only add notes to completed bookings' });
        return;
      }

      const [updated] = await sql`
        UPDATE bookings SET meet_greet_notes = ${trimmedNotes}
        WHERE id = ${bookingId} AND sitter_id = ${req.userId}
        RETURNING id, meet_greet_notes
      `;

      res.json({ booking: updated });
    } catch {
      res.status(500).json({ error: 'Failed to save notes' });
    }
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

    // Calculate next occurrence (use UTC consistently to avoid server-timezone drift)
    const now = new Date();
    const today = now.getUTCDay();
    let daysUntil = day_of_week - today;
    if (daysUntil <= 0) daysUntil += 7;
    const nextDate = new Date(now);
    nextDate.setUTCDate(now.getUTCDate() + daysUntil);
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
