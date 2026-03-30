import type { Server } from 'socket.io';
import sql from './db.ts';
import { createNotification } from './notifications.ts';

const REMINDER_AHEAD_MINUTES = 15;
const CHECK_INTERVAL_MS = 60_000; // 1 minute

/**
 * Find care tasks that are due within REMINDER_AHEAD_MINUTES and haven't
 * had a reminder sent yet. Send notifications to the appropriate user
 * (sitter if booking is in_progress, otherwise owner).
 */
export async function checkCareTaskReminders(io: Server): Promise<number> {
  const now = new Date();
  const cutoff = new Date(now.getTime() + REMINDER_AHEAD_MINUTES * 60_000);

  const tasks = await sql`
    SELECT bct.id, bct.booking_id, bct.pet_id, bct.category, bct.description,
           bct.scheduled_time, bct.notes,
           p.name as pet_name,
           b.sitter_id, b.owner_id, b.status as booking_status
    FROM booking_care_tasks bct
    JOIN pets p ON bct.pet_id = p.id
    JOIN bookings b ON bct.booking_id = b.id
    WHERE bct.scheduled_time IS NOT NULL
      AND bct.scheduled_time <= ${cutoff.toISOString()}
      AND bct.completed = false
      AND bct.reminder_sent_at IS NULL
      AND b.status IN ('confirmed', 'in_progress')
  `;

  let sentCount = 0;

  for (const task of tasks) {
    // During active booking (in_progress), notify the sitter; otherwise the owner
    const recipientId = task.booking_status === 'in_progress'
      ? task.sitter_id
      : task.owner_id;

    const scheduledTime = new Date(task.scheduled_time);
    const minutesUntil = Math.max(0, Math.round((scheduledTime.getTime() - now.getTime()) / 60_000));
    const timeLabel = minutesUntil <= 0 ? 'now' : `in ${minutesUntil} min`;

    const notification = await createNotification(
      recipientId,
      'care_task_reminder',
      `${task.pet_name}: ${task.description}`,
      `${task.category} task due ${timeLabel}${task.notes ? ` — ${task.notes}` : ''}`,
      {
        booking_id: task.booking_id,
        care_task_id: task.id,
        pet_name: task.pet_name,
        category: task.category,
        scheduled_time: task.scheduled_time,
      },
    );

    // Mark reminder as sent
    await sql`
      UPDATE booking_care_tasks SET reminder_sent_at = NOW()
      WHERE id = ${task.id}
    `;

    // Real-time push via Socket.io
    if (notification.id > 0) {
      io.to(String(recipientId)).emit('notification', notification);
    }

    sentCount++;
  }

  return sentCount;
}

let intervalId: ReturnType<typeof setInterval> | null = null;

export function startCareTaskReminderScheduler(io: Server): void {
  if (intervalId) return;
  intervalId = setInterval(() => {
    checkCareTaskReminders(io).catch((err) => {
      console.error('Care task reminder check failed:', err);
    });
  }, CHECK_INTERVAL_MS);
}

export function stopCareTaskReminderScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
