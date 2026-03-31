import { describe, it, expect } from 'vitest';
import { formatPostDate } from './PostsGrid';
import { subDays } from 'date-fns';

describe('formatPostDate', () => {
  it('formats today as Today', () => {
    const result = formatPostDate(new Date().toISOString());
    expect(result).toBe('Today');
  });

  it('formats yesterday as Yesterday', () => {
    const yesterday = subDays(new Date(), 1);
    const result = formatPostDate(yesterday.toISOString());
    expect(result).toBe('Yesterday');
  });

  it('formats older dates with month and day', () => {
    const result = formatPostDate('2025-01-15T12:00:00Z');
    expect(result).toContain('Jan');
    expect(result).toContain('15');
  });

  it('formats dates from a few days ago as short date', () => {
    const fiveDaysAgo = subDays(new Date(), 5);
    const result = formatPostDate(fiveDaysAgo.toISOString());
    expect(result).not.toBe('Today');
    expect(result).not.toBe('Yesterday');
    expect(result.length).toBeGreaterThan(0);
  });
});
