import type { Server } from 'socket.io';
import sql from './db.ts';
import { createNotification } from './notifications.ts';
import { sendEmail } from './email.ts';
import logger, { sanitizeError } from './logger.ts';
import { format } from 'date-fns';

/**
 * Check for bookings happening tomorrow and send day-before reminders.
 * Runs periodically (every hour). Only sends one reminder per booking
 * (tracked via booking_reminder_sent_at column — added lazily).
 */
export async function checkBookingReminders(io: Server): Promise<number> {
  let sentCount = 0;

  try {
    // Find confirmed bookings starting tomorrow that haven't been reminded
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tomorrowStart = new Date(Date.UTC(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth(), tomorrow.getUTCDate()));
    const tomorrowEnd = new Date(tomorrowStart.getTime() + 24 * 60 * 60 * 1000);

    const bookings = await sql`
      SELECT b.id, b.sitter_id, b.owner_id, b.start_time, b.end_time,
             s.name as sitter_name, s.email as sitter_email,
             o.name as owner_name, o.email as owner_email,
             svc.type as service_type
      FROM bookings b
      JOIN users s ON b.sitter_id = s.id
      JOIN users o ON b.owner_id = o.id
      LEFT JOIN services svc ON b.service_id = svc.id
      WHERE b.status = 'confirmed'
        AND b.start_time >= ${tomorrowStart.toISOString()}
        AND b.start_time < ${tomorrowEnd.toISOString()}
        AND b.booking_reminder_sent_at IS NULL
    `.catch(() => [] as any[]);

    for (const booking of bookings) {
      const startFormatted = format(new Date(booking.start_time), 'h:mm a');
      const serviceName = booking.service_type?.replace(/[-_]/g, ' ') || 'service';

      // Notify owner
      try {
        const [ownerPrefs] = await sql`SELECT booking_reminders, booking_reminders_email, email_enabled FROM notification_preferences WHERE user_id = ${booking.owner_id}`.catch(() => [null]);
        const prefs = ownerPrefs || { booking_reminders: true, booking_reminders_email: true, email_enabled: true };

        if (prefs.booking_reminders !== false) {
          const notif = await createNotification(
            booking.owner_id,
            'booking_status',
            'Booking Tomorrow',
            `Your ${serviceName} with ${booking.sitter_name} is tomorrow at ${startFormatted}.`,
            { booking_id: booking.id }
          );
          if (notif) io.to(String(booking.owner_id)).emit('notification', notif);
        }

        if (prefs.booking_reminders_email !== false && prefs.email_enabled !== false) {
          sendEmail({
            to: booking.owner_email,
            subject: `Reminder: ${serviceName} tomorrow at ${startFormatted}`,
            html: `<p>Hi ${booking.owner_name},</p><p>Just a reminder — your ${serviceName} with ${booking.sitter_name} is tomorrow at ${startFormatted}.</p><p>Make sure your pet's care instructions are up to date!</p><p>— PetLink</p>`,
          }).catch(() => {});
        }
      } catch (err) {
        logger.warn({ err: sanitizeError(err), bookingId: booking.id }, 'Failed to send owner booking reminder');
      }

      // Notify sitter
      try {
        const [sitterPrefs] = await sql`SELECT booking_reminders, booking_reminders_email, email_enabled FROM notification_preferences WHERE user_id = ${booking.sitter_id}`.catch(() => [null]);
        const prefs = sitterPrefs || { booking_reminders: true, booking_reminders_email: true, email_enabled: true };

        if (prefs.booking_reminders !== false) {
          const notif = await createNotification(
            booking.sitter_id,
            'booking_status',
            'Booking Tomorrow',
            `You have a ${serviceName} with ${booking.owner_name} tomorrow at ${startFormatted}. Review the care instructions.`,
            { booking_id: booking.id }
          );
          if (notif) io.to(String(booking.sitter_id)).emit('notification', notif);
        }

        if (prefs.booking_reminders_email !== false && prefs.email_enabled !== false) {
          sendEmail({
            to: booking.sitter_email,
            subject: `Reminder: ${serviceName} tomorrow at ${startFormatted}`,
            html: `<p>Hi ${booking.sitter_name},</p><p>You have a ${serviceName} with ${booking.owner_name} tomorrow at ${startFormatted}.</p><p>Review the pet's care instructions before the session.</p><p>— PetLink</p>`,
          }).catch(() => {});
        }
      } catch (err) {
        logger.warn({ err: sanitizeError(err), bookingId: booking.id }, 'Failed to send sitter booking reminder');
      }

      // Mark as sent
      await sql`
        UPDATE bookings SET booking_reminder_sent_at = NOW()
        WHERE id = ${booking.id} AND booking_reminder_sent_at IS NULL
      `.catch(() => {});

      sentCount++;
    }
  } catch (err) {
    logger.error({ err: sanitizeError(err) }, 'Booking reminder check failed');
  }

  return sentCount;
}

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startBookingReminderScheduler(io: Server): void {
  if (intervalId) return;
  // Check every hour
  intervalId = setInterval(() => checkBookingReminders(io), 60 * 60 * 1000);
  // Also run once on startup after a short delay
  setTimeout(() => checkBookingReminders(io), 30 * 1000);
  logger.info('Booking reminder scheduler started (hourly)');
}
