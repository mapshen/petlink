import { describe, it, expect } from 'vitest';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { getStatusBadgeClasses, formatBookingDate } from './BookingHistory';
import { computeOffset } from '../../hooks/useBookingHistory';
import { computePeriodRange, type AnalyticsPeriod } from '../../pages/sitter/AnalyticsPage';

describe('BookingHistory: getStatusBadgeClasses', () => {
  it('returns emerald classes for confirmed', () => {
    expect(getStatusBadgeClasses('confirmed')).toBe('bg-emerald-100 text-emerald-700');
  });

  it('returns amber classes for pending', () => {
    expect(getStatusBadgeClasses('pending')).toBe('bg-amber-100 text-amber-700');
  });

  it('returns blue classes for in_progress', () => {
    expect(getStatusBadgeClasses('in_progress')).toBe('bg-blue-100 text-blue-700');
  });

  it('returns stone classes for completed', () => {
    expect(getStatusBadgeClasses('completed')).toBe('bg-stone-100 text-stone-600');
  });

  it('returns red classes for cancelled', () => {
    expect(getStatusBadgeClasses('cancelled')).toBe('bg-red-100 text-red-700');
  });

  it('returns stone classes for unknown status', () => {
    expect(getStatusBadgeClasses('unknown')).toBe('bg-stone-100 text-stone-600');
  });
});

describe('BookingHistory: formatBookingDate', () => {
  it('formats ISO date to readable format', () => {
    expect(formatBookingDate('2026-03-15T10:00:00Z')).toBe('Mar 15, 2026');
  });

  it('formats date without time component', () => {
    // Use midday UTC to avoid timezone edge cases
    const result = formatBookingDate('2026-01-01T12:00:00Z');
    expect(result).toBe('Jan 1, 2026');
  });

  it('handles end of year date', () => {
    expect(formatBookingDate('2026-12-31T23:59:59Z')).toMatch(/Dec 31, 2026|Jan 1, 2027/);
  });
});

describe('BookingHistory: computeOffset', () => {
  it('returns 0 for page 1', () => {
    expect(computeOffset(1, 20)).toBe(0);
  });

  it('returns limit for page 2', () => {
    expect(computeOffset(2, 20)).toBe(20);
  });

  it('returns correct offset for page 3 with limit 10', () => {
    expect(computeOffset(3, 10)).toBe(20);
  });

  it('returns 0 for page 0 (clamped)', () => {
    expect(computeOffset(0, 20)).toBe(0);
  });

  it('returns 0 for negative page (clamped)', () => {
    expect(computeOffset(-1, 20)).toBe(0);
  });
});

describe('AnalyticsPage: computePeriodRange', () => {
  const fixedDate = new Date(2026, 2, 15); // March 15, 2026

  it('computes this_month range with exclusive end', () => {
    const range = computePeriodRange('this_month', fixedDate);
    expect(range.start).toBe('2026-03-01');
    expect(range.end).toBe('2026-04-01');
    expect(range.year).toBeNull();
  });

  it('computes last_3_months range with exclusive end', () => {
    const range = computePeriodRange('last_3_months', fixedDate);
    expect(range.start).toBe('2025-12-15');
    expect(range.end).toBe('2026-03-16');
    expect(range.year).toBeNull();
  });

  it('computes last_6_months range with exclusive end', () => {
    const range = computePeriodRange('last_6_months', fixedDate);
    expect(range.start).toBe('2025-09-15');
    expect(range.end).toBe('2026-03-16');
    expect(range.year).toBeNull();
  });

  it('computes this_year range with exclusive end', () => {
    const range = computePeriodRange('this_year', fixedDate);
    expect(range.start).toBe('2026-01-01');
    expect(range.end).toBe('2027-01-01');
    expect(range.year).toBe(2026);
  });

  it('computes all_time range with null dates', () => {
    const range = computePeriodRange('all_time', fixedDate);
    expect(range.start).toBeNull();
    expect(range.end).toBeNull();
    expect(range.year).toBeNull();
  });

  it('handles January for this_month with exclusive end', () => {
    const jan = new Date(2026, 0, 10);
    const range = computePeriodRange('this_month', jan);
    expect(range.start).toBe('2026-01-01');
    expect(range.end).toBe('2026-02-01');
  });

  it('handles last_3_months crossing year boundary with exclusive end', () => {
    const jan = new Date(2026, 0, 20);
    const range = computePeriodRange('last_3_months', jan);
    expect(range.start).toBe('2025-10-20');
    expect(range.end).toBe('2026-01-21');
  });

  it('defaults to null range for unknown period', () => {
    const range = computePeriodRange('invalid' as AnalyticsPeriod, fixedDate);
    expect(range.start).toBeNull();
    expect(range.end).toBeNull();
    expect(range.year).toBeNull();
  });
});
