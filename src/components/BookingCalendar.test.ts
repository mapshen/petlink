import { describe, it, expect } from 'vitest';
import { format, startOfDay, addDays } from 'date-fns';

// Test the pure availability-checking logic used by BookingCalendar
// Extracted inline for testability

function isDateAvailable(
  date: Date,
  today: Date,
  availability: Array<{ recurring: boolean; day_of_week?: number; specific_date?: string }>,
  availableDaysOfWeek: Set<number | undefined>,
  specificDates: string[]
): boolean {
  if (date < today) return false;
  if (availability.length === 0) return true;
  const dateStr = format(date, 'yyyy-MM-dd');
  if (specificDates.includes(dateStr)) return true;
  if (availableDaysOfWeek.has(date.getDay())) return true;
  return false;
}

describe('BookingCalendar: isDateAvailable', () => {
  const today = startOfDay(new Date());
  const tomorrow = addDays(today, 1);
  const yesterday = addDays(today, -1);

  it('returns false for past dates', () => {
    expect(isDateAvailable(yesterday, today, [], new Set(), [])).toBe(false);
  });

  it('returns true for future dates when no availability set', () => {
    expect(isDateAvailable(tomorrow, today, [], new Set(), [])).toBe(true);
  });

  it('returns true for matching specific date', () => {
    const dateStr = format(tomorrow, 'yyyy-MM-dd');
    const avail = [{ recurring: false, specific_date: dateStr }];
    expect(isDateAvailable(tomorrow, today, avail, new Set(), [dateStr])).toBe(true);
  });

  it('returns true for matching recurring day of week', () => {
    const dayOfWeek = tomorrow.getDay();
    const avail = [{ recurring: true, day_of_week: dayOfWeek }];
    expect(isDateAvailable(tomorrow, today, avail, new Set([dayOfWeek]), [])).toBe(true);
  });

  it('returns false when availability exists but date does not match', () => {
    const wrongDay = (tomorrow.getDay() + 3) % 7;
    const avail = [{ recurring: true, day_of_week: wrongDay }];
    expect(isDateAvailable(tomorrow, today, avail, new Set([wrongDay]), [])).toBe(false);
  });

  it('returns true for today if it matches', () => {
    const dayOfWeek = today.getDay();
    const avail = [{ recurring: true, day_of_week: dayOfWeek }];
    expect(isDateAvailable(today, today, avail, new Set([dayOfWeek]), [])).toBe(true);
  });
});
