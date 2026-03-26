import { describe, it, expect } from 'vitest';
import { validateYear, validateRevenuePeriod } from './analytics.ts';

describe('validateYear', () => {
  it('returns current year when input is undefined', () => {
    const result = validateYear(undefined);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.year).toBe(new Date().getFullYear());
    }
  });

  it('returns current year when input is empty string', () => {
    const result = validateYear('');
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.year).toBe(new Date().getFullYear());
    }
  });

  it('returns current year when input is NaN string', () => {
    const result = validateYear('abc');
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.year).toBe(new Date().getFullYear());
    }
  });

  it('accepts valid year 2024', () => {
    const result = validateYear('2024');
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.year).toBe(2024);
    }
  });

  it('accepts minimum year 2020', () => {
    const result = validateYear('2020');
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.year).toBe(2020);
    }
  });

  it('accepts currentYear + 1', () => {
    const nextYear = new Date().getFullYear() + 1;
    const result = validateYear(String(nextYear));
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.year).toBe(nextYear);
    }
  });

  it('rejects year below 2020', () => {
    const result = validateYear('2019');
    expect(result.valid).toBe(false);
    if (result.valid === false) {
      expect(result.error).toContain('2020');
    }
  });

  it('rejects year above currentYear + 1', () => {
    const tooFar = new Date().getFullYear() + 2;
    const result = validateYear(String(tooFar));
    expect(result.valid).toBe(false);
  });

  it('rejects negative year', () => {
    const result = validateYear('-1');
    expect(result.valid).toBe(false);
  });

  it('rejects floating point year', () => {
    const result = validateYear('2024.5');
    expect(result.valid).toBe(false);
  });

  it('accepts numeric input (not just string)', () => {
    const result = validateYear(2025);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.year).toBe(2025);
    }
  });
});

describe('validateRevenuePeriod', () => {
  it('returns weekly when input is "weekly"', () => {
    expect(validateRevenuePeriod('weekly')).toBe('weekly');
  });

  it('returns monthly when input is "monthly"', () => {
    expect(validateRevenuePeriod('monthly')).toBe('monthly');
  });

  it('defaults to monthly for undefined', () => {
    expect(validateRevenuePeriod(undefined)).toBe('monthly');
  });

  it('defaults to monthly for invalid string', () => {
    expect(validateRevenuePeriod('daily')).toBe('monthly');
  });

  it('defaults to monthly for empty string', () => {
    expect(validateRevenuePeriod('')).toBe('monthly');
  });

  it('defaults to monthly for null', () => {
    expect(validateRevenuePeriod(null)).toBe('monthly');
  });
});
