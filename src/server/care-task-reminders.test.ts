import { describe, it, expect } from 'vitest';
import { getRecipientId, buildTimeLabel } from './care-task-reminders.ts';

// Pure logic for filtering — mirrors the SQL WHERE clause for unit testing
interface CareTask {
  id: number;
  scheduled_time: string | null;
  completed: boolean;
  reminder_sent_at: string | null;
  booking_status: string;
  sitter_id: number;
  owner_id: number;
}

function filterTasksNeedingReminder(
  tasks: CareTask[],
  now: Date,
  aheadMinutes: number,
  lookbackHours: number,
): CareTask[] {
  const cutoff = new Date(now.getTime() + aheadMinutes * 60_000);
  const lowerBound = new Date(now.getTime() - lookbackHours * 60 * 60_000);
  return tasks.filter((t) =>
    t.scheduled_time !== null &&
    new Date(t.scheduled_time) >= lowerBound &&
    new Date(t.scheduled_time) <= cutoff &&
    !t.completed &&
    t.reminder_sent_at === null &&
    (t.booking_status === 'confirmed' || t.booking_status === 'in_progress'),
  );
}

describe('filterTasksNeedingReminder', () => {
  const now = new Date('2026-03-30T14:00:00Z');
  const AHEAD = 15;
  const LOOKBACK = 24;

  const baseTask: CareTask = {
    id: 1,
    scheduled_time: '2026-03-30T14:10:00Z',
    completed: false,
    reminder_sent_at: null,
    booking_status: 'confirmed',
    sitter_id: 2,
    owner_id: 1,
  };

  it('includes tasks within the reminder window', () => {
    expect(filterTasksNeedingReminder([baseTask], now, AHEAD, LOOKBACK)).toHaveLength(1);
  });

  it('includes overdue tasks within lookback', () => {
    const task = { ...baseTask, scheduled_time: '2026-03-30T13:50:00Z' };
    expect(filterTasksNeedingReminder([task], now, AHEAD, LOOKBACK)).toHaveLength(1);
  });

  it('excludes tasks beyond the reminder window', () => {
    const task = { ...baseTask, scheduled_time: '2026-03-30T15:00:00Z' };
    expect(filterTasksNeedingReminder([task], now, AHEAD, LOOKBACK)).toHaveLength(0);
  });

  it('excludes tasks older than lookback period', () => {
    const task = { ...baseTask, scheduled_time: '2026-03-29T12:00:00Z' };
    expect(filterTasksNeedingReminder([task], now, AHEAD, LOOKBACK)).toHaveLength(0);
  });

  it('excludes completed tasks', () => {
    const task = { ...baseTask, completed: true };
    expect(filterTasksNeedingReminder([task], now, AHEAD, LOOKBACK)).toHaveLength(0);
  });

  it('excludes tasks with reminder already sent', () => {
    const task = { ...baseTask, reminder_sent_at: '2026-03-30T13:55:00Z' };
    expect(filterTasksNeedingReminder([task], now, AHEAD, LOOKBACK)).toHaveLength(0);
  });

  it('excludes tasks from cancelled bookings', () => {
    const task = { ...baseTask, booking_status: 'cancelled' };
    expect(filterTasksNeedingReminder([task], now, AHEAD, LOOKBACK)).toHaveLength(0);
  });

  it('excludes tasks with null scheduled_time', () => {
    const task = { ...baseTask, scheduled_time: null };
    expect(filterTasksNeedingReminder([task], now, AHEAD, LOOKBACK)).toHaveLength(0);
  });

  it('includes tasks from in_progress bookings', () => {
    const task = { ...baseTask, booking_status: 'in_progress' };
    expect(filterTasksNeedingReminder([task], now, AHEAD, LOOKBACK)).toHaveLength(1);
  });
});

describe('getRecipientId', () => {
  it('returns owner for confirmed bookings', () => {
    expect(getRecipientId('confirmed', 2, 1)).toBe(1);
  });

  it('returns sitter for in_progress bookings', () => {
    expect(getRecipientId('in_progress', 2, 1)).toBe(2);
  });

  it('returns owner for pending bookings', () => {
    expect(getRecipientId('pending', 2, 1)).toBe(1);
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
