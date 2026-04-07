import sql from './db.ts';
import { createNotification } from './notifications.ts';
import { sendEmail, buildReviewReminderEmail } from './email.ts';
import logger, { sanitizeError } from './logger.ts';
import { FIRST_REVIEW_BONUS_CENTS, SUBSEQUENT_REVIEW_CREDIT_CENTS } from './review-incentives.ts';

const REMINDER_DELAY_HOURS = 24;

/**
 * Find completed bookings ~24h ago that have no owner review and no reminder sent,
 * then send the owner a notification + email nudging them to leave a review.
 * Runs daily. One reminder per booking (tracked via review_reminder_sent_at).
 */
export async function checkReviewReminders(): Promise<number> {
  let sentCount = 0;

  try {
    const bookings = await sql`
      SELECT b.id, b.owner_id, b.sitter_id,
             o.name AS owner_name, o.email AS owner_email,
             s.name AS sitter_name,
             svc.type AS service_type
      FROM bookings b
      JOIN users o ON b.owner_id = o.id
      JOIN users s ON b.sitter_id = s.id
      LEFT JOIN services svc ON b.service_id = svc.id
      WHERE b.status = 'completed'
        AND b.end_time <= NOW() - INTERVAL '${sql.unsafe(String(REMINDER_DELAY_HOURS))} hours'
        AND b.end_time > NOW() - INTERVAL '7 days'
        AND b.review_reminder_sent_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM reviews r
          WHERE r.booking_id = b.id AND r.reviewer_id = b.owner_id
        )
    `.catch(() => [] as any[]);

    for (const booking of bookings) {
      try {
        const serviceName = booking.service_type?.replace(/[-_]/g, ' ') || 'service';

        // Check if this would be the owner's first review (for email copy)
        const [{ count: priorCount }] = await sql`
          SELECT count(*)::int AS count FROM reviews
          WHERE reviewer_id = ${booking.owner_id} AND comment IS NOT NULL
        `.catch(() => [{ count: 0 }]);
        const isFirstReview = priorCount === 0;

        // In-app notification
        const notif = await createNotification(
          booking.owner_id,
          'booking_status',
          'How was your booking?',
          `Leave a review for ${booking.sitter_name} and earn a credit reward!`,
          { booking_id: booking.id }
        );
        if (notif) {
          logger.info({ bookingId: booking.id, ownerId: booking.owner_id }, 'Review reminder notification sent');
        }

        // Email (respects preferences)
        const [prefs] = await sql`
          SELECT booking_reminders_email, email_enabled
          FROM notification_preferences
          WHERE user_id = ${booking.owner_id}
        `.catch(() => [null]);
        const emailPrefs = prefs || { booking_reminders_email: true, email_enabled: true };

        if (emailPrefs.booking_reminders_email !== false && emailPrefs.email_enabled !== false) {
          const emailContent = buildReviewReminderEmail({
            ownerName: booking.owner_name,
            sitterName: booking.sitter_name,
            serviceName,
            bookingId: booking.id,
            creditAmountCents: SUBSEQUENT_REVIEW_CREDIT_CENTS,
            isFirstReview,
            firstReviewBonusCents: FIRST_REVIEW_BONUS_CENTS,
          });
          sendEmail({ to: booking.owner_email, ...emailContent }).catch(() => {});
        }

        // Mark as sent (dedup — always mark regardless of email success)
        await sql`
          UPDATE bookings SET review_reminder_sent_at = NOW()
          WHERE id = ${booking.id} AND review_reminder_sent_at IS NULL
        `.catch(() => {});

        sentCount++;
      } catch (err) {
        logger.warn({ err: sanitizeError(err), bookingId: booking.id }, 'Failed to send review reminder');
      }
    }
  } catch (err) {
    logger.error({ err: sanitizeError(err) }, 'Review reminder check failed');
  }

  return sentCount;
}

let intervalId: ReturnType<typeof setInterval> | null = null;
let timeoutId: ReturnType<typeof setTimeout> | null = null;

export function startReviewReminderScheduler(): void {
  if (intervalId) return;
  // Run daily (24 hours)
  intervalId = setInterval(() => checkReviewReminders(), 24 * 60 * 60 * 1000);
  // Initial check after 3 minutes
  timeoutId = setTimeout(() => checkReviewReminders(), 3 * 60 * 1000);
  logger.info('Review reminder scheduler started (daily)');
}

export function stopReviewReminderScheduler(): void {
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
  if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
  logger.info('Review reminder scheduler stopped');
}
