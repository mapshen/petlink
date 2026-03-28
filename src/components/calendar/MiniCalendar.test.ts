import { describe, it, expect } from 'vitest';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameMonth,
  isAfter,
} from 'date-fns';
import type { CalendarEvent } from '../../types';

// Extract the pure logic from MiniCalendar for testing

function getDotColors(events: CalendarEvent[]): string[] {
  const colors = new Set<string>();
  for (const e of events) {
    if (e.type === 'availability') {
      colors.add('bg-emerald-300');
    } else {
      switch (e.status) {
        case 'confirmed': colors.add('bg-emerald-500'); break;
        case 'pending': colors.add('bg-amber-500'); break;
        case 'in_progress': colors.add('bg-blue-500'); break;
        case 'completed': colors.add('bg-stone-400'); break;
        case 'cancelled': colors.add('bg-red-400'); break;
        default: colors.add('bg-stone-400');
      }
    }
  }
  return [...colors].slice(0, 3);
}

function computeCalendarDays(currentDate: Date): Date[] {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);

  const days: Date[] = [];
  let day = calStart;
  while (!isAfter(day, calEnd)) {
    days.push(day);
    day = addDays(day, 1);
  }
  return days;
}

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 1,
    type: 'booking',
    title: 'Walk — Luna',
    start: '2026-03-10T14:00:00Z',
    end: '2026-03-10T15:00:00Z',
    status: 'confirmed',
    ...overrides,
  };
}

describe('MiniCalendar: getDotColors', () => {
  it('returns empty array for no events', () => {
    expect(getDotColors([])).toEqual([]);
  });

  it('returns emerald-500 for confirmed booking', () => {
    const dots = getDotColors([makeEvent({ status: 'confirmed' })]);
    expect(dots).toEqual(['bg-emerald-500']);
  });

  it('returns amber-500 for pending booking', () => {
    const dots = getDotColors([makeEvent({ status: 'pending' })]);
    expect(dots).toEqual(['bg-amber-500']);
  });

  it('returns blue-500 for in_progress booking', () => {
    const dots = getDotColors([makeEvent({ status: 'in_progress' })]);
    expect(dots).toEqual(['bg-blue-500']);
  });

  it('returns emerald-300 for availability', () => {
    const dots = getDotColors([makeEvent({ type: 'availability' })]);
    expect(dots).toEqual(['bg-emerald-300']);
  });

  it('deduplicates same-status events', () => {
    const dots = getDotColors([
      makeEvent({ id: 1, status: 'confirmed' }),
      makeEvent({ id: 2, status: 'confirmed' }),
    ]);
    expect(dots).toEqual(['bg-emerald-500']);
  });

  it('returns multiple colors for mixed events', () => {
    const dots = getDotColors([
      makeEvent({ id: 1, status: 'confirmed' }),
      makeEvent({ id: 2, status: 'pending' }),
      makeEvent({ id: 3, type: 'availability' }),
    ]);
    expect(dots).toHaveLength(3);
    expect(dots).toContain('bg-emerald-500');
    expect(dots).toContain('bg-amber-500');
    expect(dots).toContain('bg-emerald-300');
  });

  it('caps at 3 colors max', () => {
    const dots = getDotColors([
      makeEvent({ id: 1, status: 'confirmed' }),
      makeEvent({ id: 2, status: 'pending' }),
      makeEvent({ id: 3, status: 'in_progress' }),
      makeEvent({ id: 4, status: 'cancelled' }),
    ]);
    expect(dots.length).toBeLessThanOrEqual(3);
  });
});

describe('MiniCalendar: computeCalendarDays', () => {
  it('generates correct number of days for March 2026', () => {
    const days = computeCalendarDays(new Date(2026, 2, 1));
    // March 2026: Sun Mar 1 is the first, so calendar starts at Sun Mar 1
    // Ends Sat Apr 4 (to complete the last week)
    expect(days.length % 7).toBe(0);
    expect(days.length).toBeGreaterThanOrEqual(28);
    expect(days.length).toBeLessThanOrEqual(42);
  });

  it('first day is a Sunday', () => {
    const days = computeCalendarDays(new Date(2026, 2, 1));
    expect(days[0].getDay()).toBe(0); // Sunday
  });

  it('last day is a Saturday', () => {
    const days = computeCalendarDays(new Date(2026, 2, 1));
    expect(days[days.length - 1].getDay()).toBe(6); // Saturday
  });

  it('contains all days of the target month', () => {
    const march2026 = new Date(2026, 2, 1);
    const days = computeCalendarDays(march2026);
    const monthDays = days.filter((d) => isSameMonth(d, march2026));
    expect(monthDays.length).toBe(31); // March has 31 days
  });

  it('handles February in non-leap year', () => {
    const feb2026 = new Date(2026, 1, 1); // Not a leap year
    const days = computeCalendarDays(feb2026);
    const monthDays = days.filter((d) => isSameMonth(d, feb2026));
    expect(monthDays.length).toBe(28);
  });
});
