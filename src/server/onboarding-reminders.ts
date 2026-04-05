import sql from './db.ts';
import { sendEmail, buildOnboardingReminderEmail } from './email.ts';
import logger, { sanitizeError } from './logger.ts';

/**
 * Onboarding reminder scheduler.
 *
 * Sends graduated email reminders to sitters who started onboarding
 * but haven't completed the required steps (Profile + Services).
 *
 * Schedule: Day 1, 2, 4, 7 after onboarding_started_at (4 emails max).
 * Runs hourly. Respects email_enabled preference.
 */

export const REMINDER_SCHEDULE = [1, 2, 4, 7]; // Days after onboarding_started_at
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export function getNextReminderDay(reminderCount: number): number | null {
  if (reminderCount >= REMINDER_SCHEDULE.length) return null;
  return REMINDER_SCHEDULE[reminderCount];
}

export function isEligibleForReminder(
  sitter: {
    onboarding_started_at: string | null;
    onboarding_reminder_count: number;
    bio: string | null;
    has_services: boolean;
    email_enabled: boolean;
  },
  now: Date
): boolean {
  if (!sitter.onboarding_started_at) return false;
  if (!sitter.email_enabled) return false;
  if (sitter.bio && sitter.has_services) return false;

  const nextDay = getNextReminderDay(sitter.onboarding_reminder_count);
  if (nextDay === null) return false;

  const startedAt = new Date(sitter.onboarding_started_at);
  const daysSinceStart = (now.getTime() - startedAt.getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceStart >= nextDay;
}

export function computeStepStatus(sitter: {
  bio: string | null;
  has_services: boolean;
  avatar_url: string | null;
  has_verification: boolean;
}) {
  return {
    profile: Boolean(sitter.bio),
    services: sitter.has_services,
    photos: Boolean(sitter.avatar_url),
    verification: sitter.has_verification,
  };
}

export async function checkOnboardingReminders(): Promise<number> {
  let sentCount = 0;

  try {
    const now = new Date();

    // Find sitters who may need a reminder
    const candidates = await sql`
      SELECT u.id, u.email, u.name, u.bio, u.avatar_url,
             u.onboarding_started_at, u.onboarding_reminder_count,
             u.onboarding_reminder_sent_at,
             EXISTS(SELECT 1 FROM services WHERE sitter_id = u.id) as has_services,
             EXISTS(SELECT 1 FROM verifications WHERE sitter_id = u.id) as has_verification
      FROM users u
      LEFT JOIN notification_preferences np ON np.user_id = u.id
      WHERE u.roles @> '{sitter}'::text[]
        AND u.onboarding_started_at IS NOT NULL
        AND u.onboarding_reminder_count < ${REMINDER_SCHEDULE.length}
        AND (u.bio IS NULL OR NOT EXISTS(SELECT 1 FROM services WHERE sitter_id = u.id))
        AND COALESCE(np.email_enabled, true) = true
    `.catch(() => [] as any[]);

    for (const sitter of candidates) {
      const eligible = isEligibleForReminder({
        onboarding_started_at: sitter.onboarding_started_at,
        onboarding_reminder_count: sitter.onboarding_reminder_count,
        bio: sitter.bio,
        has_services: sitter.has_services,
        email_enabled: true, // Already filtered in query
      }, now);

      if (!eligible) continue;

      const steps = computeStepStatus({
        bio: sitter.bio,
        has_services: sitter.has_services,
        avatar_url: sitter.avatar_url,
        has_verification: sitter.has_verification,
      });

      const reminderNumber = sitter.onboarding_reminder_count + 1;
      const email = buildOnboardingReminderEmail({
        sitterName: sitter.name,
        steps,
        reminderNumber,
      });

      sendEmail({ to: sitter.email, ...email }).catch((err) => {
        logger.error({ err: sanitizeError(err), sitterId: sitter.id }, 'Failed to send onboarding reminder email');
      });

      // Update reminder tracking
      await sql`
        UPDATE users
        SET onboarding_reminder_sent_at = NOW(),
            onboarding_reminder_count = onboarding_reminder_count + 1
        WHERE id = ${sitter.id}
      `;

      sentCount++;
    }

    if (sentCount > 0) {
      logger.info({ count: sentCount }, 'Sent onboarding reminder emails');
    }
  } catch (error) {
    logger.error({ err: sanitizeError(error) }, 'Onboarding reminder check failed');
  }

  return sentCount;
}

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startOnboardingReminderScheduler(): void {
  if (intervalId) return;
  // Initial check after 60s startup delay
  setTimeout(() => checkOnboardingReminders(), 60_000);
  intervalId = setInterval(() => checkOnboardingReminders(), CHECK_INTERVAL_MS);
  logger.info('Onboarding reminder scheduler started (hourly)');
}

export function stopOnboardingReminderScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
