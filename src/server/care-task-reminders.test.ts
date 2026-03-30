import { describe, it, expect, vi, beforeEach } from 'vitest';

// Test the reminder logic as pure functions

interface CareTask {
  id: number;
  scheduled_time: string | null;
  completed: boolean;
  reminder_sent_at: string | null;
  booking_status: string;
  sitter_id: number;
  owner_id: number;
  pet_name: string;
  description: string;
  category: string;
}

/**
 * Determine which care tasks need reminders sent.
 * Mirrors the SQL query logic from checkCareTaskReminders.
 */
function filterTasksNeedingReminder(
  tasks: CareTask[],
  now: Date,
  aheadMinutes: number,
): CareTask[] {
  const cutoff = new Date(now.getTime() + aheadMinutes * 60_000);
  return tasks.filter((t) =>
    t.scheduled_time !== null &&
    new Date(t.scheduled_time) <= cutoff &&
    !t.completed &&
    t.reminder_sent_at === null &&
    (t.booking_status === 'confirmed' || t.booking_status === 'in_progress'),
  );
}

/**
 * Determine the notification recipient for a care task.
 * In-progress bookings notify the sitter; otherwise the owner.
 */
function getRecipient(task: CareTask): number {
  return task.booking_status === 'in_progress' ? task.sitter_id : task.owner_id;
}

/**
 * Build the time label for the notification body.
 */
function buildTimeLabel(scheduledTime: Date, now: Date): string {
  const minutesUntil = Math.max(0, Math.round((scheduledTime.getTime() - now.getTime()) / 60_000));
  return minutesUntil <= 0 ? 'now' : `in ${minutesUntil} min`;
}

describe('filterTasksNeedingReminder', () => {
  const now = new Date('2026-03-30T14:00:00Z');
  const AHEAD = 15;

  const baseTask: CareTask = {
    id: 1,
    scheduled_time: '2026-03-30T14:10:00Z', // 10 min from now
    completed: false,
    reminder_sent_at: null,
    booking_status: 'confirmed',
    sitter_id: 2,
    owner_id: 1,
    pet_name: 'Buddy',
    description: 'Feed dog',
    category: 'feeding',
  };

  it('includes tasks within the reminder window', () => {
    const result = filterTasksNeedingReminder([baseTask], now, AHEAD);
    expect(result).toHaveLength(1);
  });

  it('includes tasks that are overdue (past scheduled_time)', () => {
    const task = { ...baseTask, scheduled_time: '2026-03-30T13:50:00Z' };
    const result = filterTasksNeedingReminder([task], now, AHEAD);
    expect(result).toHaveLength(1);
  });

  it('excludes tasks beyond the reminder window', () => {
    const task = { ...baseTask, scheduled_time: '2026-03-30T15:00:00Z' }; // 60 min away
    const result = filterTasksNeedingReminder([task], now, AHEAD);
    expect(result).toHaveLength(0);
  });

  it('excludes completed tasks', () => {
    const task = { ...baseTask, completed: true };
    const result = filterTasksNeedingReminder([task], now, AHEAD);
    expect(result).toHaveLength(0);
  });

  it('excludes tasks with reminder already sent', () => {
    const task = { ...baseTask, reminder_sent_at: '2026-03-30T13:55:00Z' };
    const result = filterTasksNeedingReminder([task], now, AHEAD);
    expect(result).toHaveLength(0);
  });

  it('excludes tasks from cancelled bookings', () => {
    const task = { ...baseTask, booking_status: 'cancelled' };
    const result = filterTasksNeedingReminder([task], now, AHEAD);
    expect(result).toHaveLength(0);
  });

  it('excludes tasks with null scheduled_time', () => {
    const task = { ...baseTask, scheduled_time: null };
    const result = filterTasksNeedingReminder([task], now, AHEAD);
    expect(result).toHaveLength(0);
  });

  it('includes tasks from in_progress bookings', () => {
    const task = { ...baseTask, booking_status: 'in_progress' };
    const result = filterTasksNeedingReminder([task], now, AHEAD);
    expect(result).toHaveLength(1);
  });
});

describe('getRecipient', () => {
  const task: CareTask = {
    id: 1, scheduled_time: '2026-03-30T14:00:00Z', completed: false,
    reminder_sent_at: null, booking_status: 'confirmed',
    sitter_id: 2, owner_id: 1, pet_name: 'Buddy', description: 'Feed', category: 'feeding',
  };

  it('returns owner for confirmed bookings', () => {
    expect(getRecipient(task)).toBe(1);
  });

  it('returns sitter for in_progress bookings', () => {
    expect(getRecipient({ ...task, booking_status: 'in_progress' })).toBe(2);
  });
});

describe('buildTimeLabel', () => {
  it('returns "now" for overdue tasks', () => {
    const scheduled = new Date('2026-03-30T13:50:00Z');
    const now = new Date('2026-03-30T14:00:00Z');
    expect(buildTimeLabel(scheduled, now)).toBe('now');
  });

  it('returns minutes for upcoming tasks', () => {
    const scheduled = new Date('2026-03-30T14:10:00Z');
    const now = new Date('2026-03-30T14:00:00Z');
    expect(buildTimeLabel(scheduled, now)).toBe('in 10 min');
  });

  it('returns "now" for tasks due at current time', () => {
    const now = new Date('2026-03-30T14:00:00Z');
    expect(buildTimeLabel(now, now)).toBe('now');
  });
});
