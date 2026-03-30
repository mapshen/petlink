import { describe, it, expect } from 'vitest';

interface TimelineItem {
  type: 'booking' | 'care_task' | 'availability';
  time: Date;
  id: number;
  data: Record<string, unknown>;
}

interface BookingLike {
  id: number;
  start_time: string;
  end_time: string;
  status: string;
  sitter_id: number;
  owner_id: number;
}

interface CareTaskLike {
  id: number;
  scheduled_time: string | null;
  booking_id: number;
  completed: boolean;
}

interface AvailabilityLike {
  id: number;
  start_time: string;
  end_time: string;
}

function mergeTimeline(
  bookings: BookingLike[],
  careTasks: CareTaskLike[],
  availabilities: AvailabilityLike[],
): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const b of bookings) {
    items.push({
      type: 'booking',
      time: new Date(b.start_time),
      id: b.id,
      data: b as unknown as Record<string, unknown>,
    });
  }

  for (const t of careTasks) {
    if (!t.scheduled_time) continue;
    items.push({
      type: 'care_task',
      time: new Date(t.scheduled_time),
      id: t.id,
      data: t as unknown as Record<string, unknown>,
    });
  }

  for (const a of availabilities) {
    items.push({
      type: 'availability',
      time: new Date(a.start_time),
      id: a.id,
      data: a as unknown as Record<string, unknown>,
    });
  }

  return items.sort((a, b) => a.time.getTime() - b.time.getTime());
}

describe('mergeTimeline', () => {
  it('merges and sorts by time', () => {
    const bookings = [
      { id: 1, start_time: '2026-03-30T14:00:00Z', end_time: '2026-03-30T15:00:00Z', status: 'confirmed', sitter_id: 2, owner_id: 1 },
    ];
    const tasks = [
      { id: 10, scheduled_time: '2026-03-30T08:00:00Z', booking_id: 1, completed: false },
      { id: 11, scheduled_time: '2026-03-30T18:00:00Z', booking_id: 1, completed: false },
    ];
    const avails = [
      { id: 20, start_time: '2026-03-30T09:00:00Z', end_time: '2026-03-30T12:00:00Z' },
    ];

    const result = mergeTimeline(bookings, tasks, avails);
    expect(result).toHaveLength(4);
    expect(result.map(r => r.type)).toEqual(['care_task', 'availability', 'booking', 'care_task']);
    expect(result.map(r => r.id)).toEqual([10, 20, 1, 11]);
  });

  it('excludes care tasks without scheduled_time', () => {
    const tasks = [
      { id: 10, scheduled_time: '2026-03-30T08:00:00Z', booking_id: 1, completed: false },
      { id: 11, scheduled_time: null, booking_id: 1, completed: false },
    ];
    const result = mergeTimeline([], tasks, []);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(10);
  });

  it('handles empty inputs', () => {
    expect(mergeTimeline([], [], [])).toEqual([]);
  });

  it('handles bookings only', () => {
    const bookings = [
      { id: 1, start_time: '2026-03-30T10:00:00Z', end_time: '2026-03-30T11:00:00Z', status: 'confirmed', sitter_id: 2, owner_id: 1 },
      { id: 2, start_time: '2026-03-30T08:00:00Z', end_time: '2026-03-30T09:00:00Z', status: 'pending', sitter_id: 2, owner_id: 1 },
    ];
    const result = mergeTimeline(bookings, [], []);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(2); // 8am before 10am
    expect(result[1].id).toBe(1);
  });
});
