import sql from './db.ts';
import { capturePayment } from './payments.ts';
import { schedulePayoutForBooking } from './payouts.ts';
import { sendEmail, buildDepositCreditReminderEmail } from './email.ts';
import { createNotification } from './notifications.ts';
import logger, { sanitizeError } from './logger.ts';
import type { Server } from 'socket.io';

/**
 * Deposit release scheduler.
 *
 * Handles two jobs:
 * 1. Release held deposits to sitters after 30-day expiry
 * 2. Send graduated credit reminder emails to owners (Day 7, 14, 25)
 *
 * Runs hourly.
 */

const DEPOSIT_EXPIRY_DAYS = 30;
const REMINDER_SCHEDULE = [7, 14, 25]; // Days after meet & greet completion
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export async function checkDepositReleases(io: Server): Promise<number> {
  let processedCount = 0;

  try {
    // --- 1. Release expired deposits to sitters ---
    const expiredDeposits = await sql`
      SELECT b.id, b.sitter_id, b.owner_id, b.total_price_cents, b.payment_intent_id,
             s.name as sitter_name, o.name as owner_name
      FROM bookings b
      JOIN users s ON b.sitter_id = s.id
      JOIN users o ON b.owner_id = o.id
      JOIN services svc ON b.service_id = svc.id
      WHERE b.deposit_status = 'held'
        AND b.status = 'completed'
        AND svc.type = 'meet_greet'
        AND b.created_at < NOW() - INTERVAL '${DEPOSIT_EXPIRY_DAYS} days'
        AND NOT EXISTS (
          SELECT 1 FROM bookings b2 WHERE b2.deposit_applied_to_booking_id = b.id
        )
    `.catch((err) => {
      logger.error({ err: sanitizeError(err) }, 'Failed to query expired deposits');
      return [] as any[];
    });

    for (const deposit of expiredDeposits) {
      try {
        // Capture the held payment → sitter gets paid
        if (deposit.payment_intent_id) {
          await capturePayment(deposit.payment_intent_id);
          await schedulePayoutForBooking(deposit.id, deposit.sitter_id, deposit.total_price_cents, 1);
        }

        await sql`UPDATE bookings SET deposit_status = 'released_to_sitter' WHERE id = ${deposit.id}`;

        // Notify owner
        const notification = await createNotification(
          deposit.owner_id, 'booking_status', 'Deposit Released',
          `Your $${(deposit.total_price_cents / 100).toFixed(2)} meet & greet deposit with ${deposit.sitter_name} has been released to the sitter.`,
          { booking_id: deposit.id }
        );
        if (notification) io.to(String(deposit.owner_id)).emit('notification', notification);

        processedCount++;
      } catch (err) {
        logger.error({ err: sanitizeError(err), bookingId: deposit.id }, 'Failed to release deposit');
      }
    }

    // --- 2. Send credit reminder emails ---
    const reminderCandidates = await sql`
      SELECT b.id, b.owner_id, b.sitter_id, b.total_price_cents, b.deposit_reminder_count, b.created_at,
             o.name as owner_name, o.email as owner_email,
             s.name as sitter_name
      FROM bookings b
      JOIN users o ON b.owner_id = o.id
      JOIN users s ON b.sitter_id = s.id
      JOIN services svc ON b.service_id = svc.id
      LEFT JOIN notification_preferences np ON np.user_id = b.owner_id
      WHERE b.deposit_status = 'held'
        AND b.status = 'completed'
        AND svc.type = 'meet_greet'
        AND b.deposit_reminder_count < ${REMINDER_SCHEDULE.length}
        AND COALESCE(np.email_enabled, true) = true
    `.catch((err) => {
      logger.error({ err: sanitizeError(err) }, 'Failed to query deposit reminder candidates');
      return [] as any[];
    });

    for (const booking of reminderCandidates) {
      const daysSinceCompletion = (Date.now() - new Date(booking.created_at).getTime()) / (1000 * 60 * 60 * 24);
      const nextReminderDay = REMINDER_SCHEDULE[booking.deposit_reminder_count];
      if (daysSinceCompletion < nextReminderDay) continue;

      const daysRemaining = Math.max(0, DEPOSIT_EXPIRY_DAYS - Math.floor(daysSinceCompletion));

      // Update tracking first to prevent duplicate sends
      await sql`
        UPDATE bookings SET deposit_reminder_count = deposit_reminder_count + 1
        WHERE id = ${booking.id}
      `;

      const email = buildDepositCreditReminderEmail({
        ownerName: booking.owner_name,
        sitterName: booking.sitter_name,
        creditCents: booking.total_price_cents,
        daysRemaining,
        sitterId: booking.sitter_id,
      });

      sendEmail({ to: booking.owner_email, ...email }).catch((err) => {
        logger.error({ err: sanitizeError(err), bookingId: booking.id }, 'Failed to send deposit reminder');
      });

      processedCount++;
    }

    if (processedCount > 0) {
      logger.info({ count: processedCount }, 'Processed deposit releases and reminders');
    }
  } catch (error) {
    logger.error({ err: sanitizeError(error) }, 'Deposit release check failed');
  }

  return processedCount;
}

let intervalId: ReturnType<typeof setInterval> | null = null;
let initialTimeoutId: ReturnType<typeof setTimeout> | null = null;

export function startDepositReleaseScheduler(io: Server): void {
  if (intervalId) return;
  initialTimeoutId = setTimeout(() => {
    initialTimeoutId = null;
    checkDepositReleases(io);
  }, 90_000); // 90s startup delay
  intervalId = setInterval(() => checkDepositReleases(io), CHECK_INTERVAL_MS);
  logger.info('Deposit release scheduler started (hourly)');
}

export function stopDepositReleaseScheduler(): void {
  if (initialTimeoutId) { clearTimeout(initialTimeoutId); initialTimeoutId = null; }
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
}
