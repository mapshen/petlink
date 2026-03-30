import { describe, it, expect } from 'vitest';
import { mergeTimeline } from './useTodaySchedule';

describe('mergeTimeline', () => {
  it('merges and sorts by time', () => {
    const bookings = [
      { id: 1, start_time: '2026-03-30T14:00:00Z', end_time: '2026-03-30T15:00:00Z', status: 'confirmed', sitter_id: 2, owner_id: 1 },
    ] as any[];
    const tasks = [
      { id: 10, scheduled_time: '2026-03-30T08:00:00Z', booking_id: 1, completed: false },
      { id: 11, scheduled_time: '2026-03-30T18:00:00Z', booking_id: 1, completed: false },
    ] as any[];
    const avails = [
      { id: 20, start_time: '2026-03-30T09:00:00Z', end_time: '2026-03-30T12:00:00Z' },
    ] as any[];

    const result = mergeTimeline(bookings, tasks, avails);
    expect(result).toHaveLength(4);
    expect(result.map(r => r.type)).toEqual(['care_task', 'availability', 'booking', 'care_task']);
    expect(result.map(r => r.id)).toEqual([10, 20, 1, 11]);
  });

  it('excludes care tasks without scheduled_time', () => {
    const tasks = [
      { id: 10, scheduled_time: '2026-03-30T08:00:00Z', booking_id: 1, completed: false },
      { id: 11, scheduled_time: null, booking_id: 1, completed: false },
    ] as any[];
    const result = mergeTimeline([], tasks, []);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(10);
  });

  it('handles empty inputs', () => {
    expect(mergeTimeline([], [], [])).toEqual([]);
  });

  it('sorts bookings by start_time', () => {
    const bookings = [
      { id: 1, start_time: '2026-03-30T10:00:00Z', end_time: '2026-03-30T11:00:00Z', status: 'confirmed', sitter_id: 2, owner_id: 1 },
      { id: 2, start_time: '2026-03-30T08:00:00Z', end_time: '2026-03-30T09:00:00Z', status: 'pending', sitter_id: 2, owner_id: 1 },
    ] as any[];
    const result = mergeTimeline(bookings, [], []);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(2);
    expect(result[1].id).toBe(1);
  });

  it('includes endTime for bookings and availability', () => {
    const bookings = [
      { id: 1, start_time: '2026-03-30T10:00:00Z', end_time: '2026-03-30T11:00:00Z', status: 'confirmed', sitter_id: 2, owner_id: 1 },
    ] as any[];
    const avails = [
      { id: 20, start_time: '2026-03-30T09:00:00Z', end_time: '2026-03-30T12:00:00Z' },
    ] as any[];
    const result = mergeTimeline(bookings, [], avails);
    expect(result[0].endTime).toBeDefined();
    expect(result[1].endTime).toBeDefined();
  });
});
