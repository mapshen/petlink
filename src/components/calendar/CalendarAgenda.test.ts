import { describe, it, expect } from 'vitest';
import { parseISO, isAfter, startOfDay, isSameDay } from 'date-fns';
import type { CalendarEvent } from '../../types';

// Extract pure logic from CalendarAgenda for testing

function sortEvents(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
}

function getUpcomingEvents(
  allEvents: CalendarEvent[],
  referenceDay: Date,
  limit: number = 5
): CalendarEvent[] {
  const start = startOfDay(referenceDay);
  return allEvents
    .filter((e) => e.type === 'booking' && isAfter(parseISO(e.start), start) && !isSameDay(parseISO(e.start), start))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .slice(0, limit);
}

function getBorderColor(status?: string): string {
  switch (status) {
    case 'confirmed': return 'border-l-emerald-500';
    case 'pending': return 'border-l-amber-500';
    case 'in_progress': return 'border-l-blue-500';
    case 'completed': return 'border-l-stone-400';
    case 'cancelled': return 'border-l-red-400';
    default: return 'border-l-stone-300';
  }
}

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 1,
    type: 'booking',
    title: 'Dog Walking — Luna',
    start: '2026-03-10T14:00:00Z',
    end: '2026-03-10T15:00:00Z',
    status: 'confirmed',
    ...overrides,
  };
}

describe('CalendarAgenda: sortEvents', () => {
  it('sorts events by start time ascending', () => {
    const events = [
      makeEvent({ id: 1, start: '2026-03-10T16:00:00Z' }),
      makeEvent({ id: 2, start: '2026-03-10T09:00:00Z' }),
      makeEvent({ id: 3, start: '2026-03-10T12:00:00Z' }),
    ];
    const sorted = sortEvents(events);
    expect(sorted.map((e) => e.id)).toEqual([2, 3, 1]);
  });

  it('does not mutate original array', () => {
    const events = [
      makeEvent({ id: 1, start: '2026-03-10T16:00:00Z' }),
      makeEvent({ id: 2, start: '2026-03-10T09:00:00Z' }),
    ];
    const original = [...events];
    sortEvents(events);
    expect(events.map((e) => e.id)).toEqual(original.map((e) => e.id));
  });

  it('returns empty array for no events', () => {
    expect(sortEvents([])).toEqual([]);
  });
});

describe('CalendarAgenda: getUpcomingEvents', () => {
  const referenceDay = new Date(2026, 2, 10); // March 10

  it('returns future booking events after reference day', () => {
    const events = [
      makeEvent({ id: 1, start: '2026-03-15T14:00:00Z' }),
      makeEvent({ id: 2, start: '2026-03-20T09:00:00Z' }),
    ];
    const upcoming = getUpcomingEvents(events, referenceDay);
    expect(upcoming).toHaveLength(2);
    expect(upcoming[0].id).toBe(1);
    expect(upcoming[1].id).toBe(2);
  });

  it('excludes events on the same day as reference', () => {
    const events = [
      makeEvent({ id: 1, start: '2026-03-10T14:00:00Z' }),
      makeEvent({ id: 2, start: '2026-03-11T09:00:00Z' }),
    ];
    const upcoming = getUpcomingEvents(events, referenceDay);
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0].id).toBe(2);
  });

  it('excludes past events', () => {
    const events = [
      makeEvent({ id: 1, start: '2026-03-05T14:00:00Z' }),
      makeEvent({ id: 2, start: '2026-03-15T09:00:00Z' }),
    ];
    const upcoming = getUpcomingEvents(events, referenceDay);
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0].id).toBe(2);
  });

  it('excludes availability events', () => {
    const events = [
      makeEvent({ id: 1, type: 'availability', start: '2026-03-15T09:00:00Z' }),
      makeEvent({ id: 2, type: 'booking', start: '2026-03-15T14:00:00Z' }),
    ];
    const upcoming = getUpcomingEvents(events, referenceDay);
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0].id).toBe(2);
  });

  it('limits results to specified count', () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      makeEvent({ id: i + 1, start: `2026-03-${15 + i}T14:00:00Z` })
    );
    const upcoming = getUpcomingEvents(events, referenceDay, 3);
    expect(upcoming).toHaveLength(3);
  });

  it('returns sorted by start time', () => {
    const events = [
      makeEvent({ id: 1, start: '2026-03-20T14:00:00Z' }),
      makeEvent({ id: 2, start: '2026-03-12T09:00:00Z' }),
      makeEvent({ id: 3, start: '2026-03-15T12:00:00Z' }),
    ];
    const upcoming = getUpcomingEvents(events, referenceDay);
    expect(upcoming.map((e) => e.id)).toEqual([2, 3, 1]);
  });
});

describe('CalendarAgenda: getBorderColor', () => {
  it('returns emerald for confirmed', () => {
    expect(getBorderColor('confirmed')).toBe('border-l-emerald-500');
  });

  it('returns amber for pending', () => {
    expect(getBorderColor('pending')).toBe('border-l-amber-500');
  });

  it('returns blue for in_progress', () => {
    expect(getBorderColor('in_progress')).toBe('border-l-blue-500');
  });

  it('returns stone for completed', () => {
    expect(getBorderColor('completed')).toBe('border-l-stone-400');
  });

  it('returns red for cancelled', () => {
    expect(getBorderColor('cancelled')).toBe('border-l-red-400');
  });

  it('returns default for undefined status', () => {
    expect(getBorderColor(undefined)).toBe('border-l-stone-300');
  });
});
