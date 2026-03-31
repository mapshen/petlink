import { describe, it, expect } from 'vitest';
import { formatPostDate } from './PostsGrid';

describe('formatPostDate', () => {
  it('formats a recent date', () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 86400000);
    const result = formatPostDate(yesterday.toISOString());
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('formats today as Today', () => {
    const result = formatPostDate(new Date().toISOString());
    expect(result).toBe('Today');
  });

  it('formats yesterday as Yesterday', () => {
    const yesterday = new Date(Date.now() - 86400000);
    const result = formatPostDate(yesterday.toISOString());
    expect(result).toBe('Yesterday');
  });

  it('formats older dates as short date', () => {
    const result = formatPostDate('2025-01-15T12:00:00Z');
    expect(result).toContain('Jan');
    expect(result).toContain('15');
  });
});
