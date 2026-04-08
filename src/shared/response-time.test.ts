import { describe, it, expect } from 'vitest';
import { formatResponseTime, responseTimeMatchesFilter } from './response-time.ts';

describe('formatResponseTime', () => {
  it('returns null for null input', () => {
    expect(formatResponseTime(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(formatResponseTime(undefined)).toBeNull();
  });

  it('returns null for >= 24 hours', () => {
    expect(formatResponseTime(24)).toBeNull();
    expect(formatResponseTime(48)).toBeNull();
  });

  it('returns < 1 hour label for sub-hour response', () => {
    const result = formatResponseTime(0.5);
    expect(result).toEqual({
      label: 'Responds in < 1 hour',
      shortLabel: '< 1hr',
      color: 'emerald',
    });
  });

  it('returns < 4 hours label for 1-4 hour response', () => {
    const result = formatResponseTime(2.5);
    expect(result).toEqual({
      label: 'Responds in < 4 hours',
      shortLabel: '< 4hrs',
      color: 'emerald',
    });
  });

  it('returns < 24 hours label for 4-24 hour response', () => {
    const result = formatResponseTime(12);
    expect(result).toEqual({
      label: 'Responds in < 24 hours',
      shortLabel: '< 24hrs',
      color: 'amber',
    });
  });

  it('returns < 1 hour for zero response time', () => {
    const result = formatResponseTime(0);
    expect(result).toEqual({
      label: 'Responds in < 1 hour',
      shortLabel: '< 1hr',
      color: 'emerald',
    });
  });
});

describe('responseTimeMatchesFilter', () => {
  it('returns false for null hours', () => {
    expect(responseTimeMatchesFilter(null, 1)).toBe(false);
  });

  it('returns false for undefined hours', () => {
    expect(responseTimeMatchesFilter(undefined, 4)).toBe(false);
  });

  it('matches when hours <= filter', () => {
    expect(responseTimeMatchesFilter(0.5, 1)).toBe(true);
    expect(responseTimeMatchesFilter(1, 1)).toBe(true);
    expect(responseTimeMatchesFilter(3, 4)).toBe(true);
  });

  it('does not match when hours > filter', () => {
    expect(responseTimeMatchesFilter(2, 1)).toBe(false);
    expect(responseTimeMatchesFilter(5, 4)).toBe(false);
  });
});
