import type { Server } from 'socket.io';
import sql from './db.ts';
import { createNotification } from './notifications.ts';
import logger, { sanitizeError } from './logger.ts';

const REMINDER_AHEAD_MINUTES = 15;
const CHECK_INTERVAL_MS = 60_000; // 1 minute
const LOOKBACK_HOURS = 24;

export function getRecipientId(bookingStatus: string, sitterId: number, ownerId: number): number {
  return bookingStatus === 'in_progress' ? sitterId : ownerId;
}

export function buildTimeLabel(scheduledTime: Date, now: Date): string {
  const minutesUntil = Math.max(0, Math.round((scheduledTime.getTime() - now.getTime()) / 60_000));
  return minutesUntil <= 0 ? 'now' : `in ${minutesUntil} min`;
}

/**
 * Find care tasks due within REMINDER_AHEAD_MINUTES that haven't had a
 * reminder sent. Send notifications to the appropriate user and mark sent.
 */
export async function checkCareTaskReminders(io: Server): Promise<number> {
  const now = new Date();
  const cutoff = new Date(now.getTime() + REMINDER_AHEAD_MINUTES * 60_000);
  const lowerBound = new Date(now.getTime() - LOOKBACK_HOURS * 60 * 60_000);

  const tasks = await sql`
    SELECT bct.id, bct.booking_id, bct.pet_id, bct.category, bct.description,
           bct.scheduled_time, bct.notes,
           p.name as pet_name,
           b.sitter_id, b.owner_id, b.status as booking_status
    FROM booking_care_tasks bct
    JOIN pets p ON bct.pet_id = p.id
    JOIN bookings b ON bct.booking_id = b.id
    WHERE bct.scheduled_time IS NOT NULL
      AND bct.scheduled_time >= ${lowerBound.toISOString()}
      AND bct.scheduled_time <= ${cutoff.toISOString()}
      AND bct.completed = false
      AND bct.reminder_sent_at IS NULL
      AND b.status IN ('confirmed', 'in_progress')
  `;

  if (tasks.length === 0) return 0;

  // Pre-fetch notification preferences for all recipients
  const recipientMap = new Map<number, number>();
  for (const task of tasks) {
    recipientMap.set(task.id, getRecipientId(task.booking_status, task.sitter_id, task.owner_id));
  }
  const recipientIds = [...new Set(recipientMap.values())];
  const prefs = await sql`SELECT * FROM notification_preferences WHERE user_id = ANY(${recipientIds})`;
  const prefsMap = new Map(prefs.map((p: Record<string, unknown>) => [p.user_id as number, p]));

  let sentCount = 0;

  for (const task of tasks) {
    try {
      const recipientId = recipientMap.get(task.id)!;
      const scheduledTime = new Date(task.scheduled_time);
      const timeLabel = buildTimeLabel(scheduledTime, now);

      // Check preferences before creating notification
      const userPrefs = prefsMap.get(recipientId);
      if (userPrefs && !userPrefs.booking_status) {
        // User has disabled this notification category — skip but don't mark sent
        // so it can be delivered if they re-enable before the task
        continue;
      }

      const notification = await createNotification(
        recipientId,
        'care_task_reminder',
        `${task.pet_name}: ${task.description}`,
        `${task.category} task due ${timeLabel}${task.notes ? ` \u2014 ${task.notes}` : ''}`,
        {
          booking_id: task.booking_id,
          care_task_id: task.id,
          pet_name: task.pet_name,
          category: task.category,
          scheduled_time: task.scheduled_time,
        },
      );

      // Only mark sent and push if notification was actually created
      if (notification.id > 0) {
        await sql`
          UPDATE booking_care_tasks SET reminder_sent_at = NOW()
          WHERE id = ${task.id} AND reminder_sent_at IS NULL
        `;
        io.to(String(recipientId)).emit('notification', notification);
        sentCount++;
      }
    } catch (err) {
      logger.error({ err: sanitizeError(err), taskId: task.id }, 'Failed to send care task reminder');
    }
  }

  return sentCount;
}

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startCareTaskReminderScheduler(io: Server): void {
  if (intervalId) return;
  intervalId = setInterval(() => {
    checkCareTaskReminders(io).catch((err) => {
      logger.error({ err: sanitizeError(err) }, 'Care task reminder check failed');
    });
  }, CHECK_INTERVAL_MS);
}

export function stopCareTaskReminderScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
