import sql from './db.ts';
import { refundPayment } from './payments.ts';
import { sendEmail, buildDepositCreditReminderEmail } from './email.ts';
import { createNotification } from './notifications.ts';
import logger, { sanitizeError } from './logger.ts';
import type { Server } from 'socket.io';

/**
 * Deposit credit reminder scheduler.
 *
 * Meet & greet deposits are captured immediately on booking completion
 * (handled in the booking status transition). This scheduler:
 *
 * 1. Sends graduated credit reminder emails (Day 7, 14, 25 after completion)
 * 2. Marks expired credits (30+ days after completion with no follow-up booking)
 *
 * Deposits are already captured, so "release to sitter" means no action needed —
 * the sitter already has the funds. We just update the status for bookkeeping.
 *
 * Runs hourly.
 */

const DEPOSIT_EXPIRY_DAYS = 30;
const REMINDER_SCHEDULE = [7, 14, 25]; // Days after meet & greet end_time
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export async function checkDepositReleases(io: Server): Promise<number> {
  let processedCount = 0;
  const cutoffDate = new Date(Date.now() - DEPOSIT_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();

  try {
    // --- 1. Mark expired deposits (sitter keeps the money, just update status) ---
    const expired = await sql`
      UPDATE bookings SET deposit_status = 'released_to_sitter'
      WHERE id IN (
        SELECT b.id FROM bookings b
        JOIN services svc ON b.service_id = svc.id
        WHERE b.deposit_status = 'captured_as_deposit'
          AND b.status = 'completed'
          AND svc.type = 'meet_greet'
          AND b.end_time < ${cutoffDate}::timestamptz
          AND NOT EXISTS (
            SELECT 1 FROM bookings b2 WHERE b2.deposit_applied_to_booking_id = b.id
          )
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, owner_id, sitter_id, total_price_cents
    `.catch((err) => {
      logger.error({ err: sanitizeError(err) }, 'Failed to expire deposits');
      return [] as any[];
    });

    for (const deposit of expired) {
      const [sitter] = await sql`SELECT name FROM users WHERE id = ${deposit.sitter_id}`;
      const notification = await createNotification(
        deposit.owner_id, 'booking_status', 'Deposit Expired',
        `Your $${(deposit.total_price_cents / 100).toFixed(2)} meet & greet credit with ${sitter.name} has expired.`,
        { booking_id: deposit.id }
      );
      if (notification) io.to(String(deposit.owner_id)).emit('notification', notification);
      processedCount++;
    }

    // --- 2. Send credit reminder emails ---
    const reminderCandidates = await sql`
      SELECT b.id, b.owner_id, b.sitter_id, b.total_price_cents, b.deposit_reminder_count, b.end_time,
             o.name as owner_name, o.email as owner_email,
             s.name as sitter_name
      FROM bookings b
      JOIN users o ON b.owner_id = o.id
      JOIN users s ON b.sitter_id = s.id
      JOIN services svc ON b.service_id = svc.id
      LEFT JOIN notification_preferences np ON np.user_id = b.owner_id
      WHERE b.deposit_status = 'captured_as_deposit'
        AND b.status = 'completed'
        AND svc.type = 'meet_greet'
        AND b.deposit_reminder_count < ${REMINDER_SCHEDULE.length}
        AND COALESCE(np.email_enabled, true) = true
    `.catch((err) => {
      logger.error({ err: sanitizeError(err) }, 'Failed to query deposit reminder candidates');
      return [] as any[];
    });

    for (const booking of reminderCandidates) {
      const daysSinceCompletion = (Date.now() - new Date(booking.end_time).getTime()) / (1000 * 60 * 60 * 24);
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
      logger.info({ count: processedCount }, 'Processed deposit expirations and reminders');
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
  initialTimeoutId = setTimeout(async () => {
    initialTimeoutId = null;
    await checkDepositReleases(io);
    intervalId = setInterval(() => checkDepositReleases(io), CHECK_INTERVAL_MS);
  }, 90_000);
  logger.info('Deposit release scheduler started (hourly)');
}

export function stopDepositReleaseScheduler(): void {
  if (initialTimeoutId) { clearTimeout(initialTimeoutId); initialTimeoutId = null; }
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
}
