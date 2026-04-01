import { describe, it, expect } from 'vitest';
import { dollarsToCents, formatCents, formatCentsDecimal, addCents } from './money';

describe('dollarsToCents', () => {
  it('converts whole dollars', () => {
    expect(dollarsToCents(25)).toBe(2500);
  });

  it('converts dollars with cents', () => {
    expect(dollarsToCents(25.50)).toBe(2550);
  });

  it('handles the classic float problem correctly', () => {
    // 19.99 * 100 = 1998.9999999999998 in IEEE 754
    expect(dollarsToCents(19.99)).toBe(1999);
  });

  it('converts zero', () => {
    expect(dollarsToCents(0)).toBe(0);
  });

  it('handles small amounts', () => {
    expect(dollarsToCents(0.01)).toBe(1);
    expect(dollarsToCents(0.99)).toBe(99);
  });

  it('rounds half-cent up', () => {
    expect(dollarsToCents(25.555)).toBe(2556);
  });
});

describe('formatCents', () => {
  it('formats whole dollar amounts', () => {
    expect(formatCents(2500)).toBe('$25.00');
  });

  it('formats with cents', () => {
    expect(formatCents(2550)).toBe('$25.50');
  });

  it('formats single-digit cents', () => {
    expect(formatCents(1999)).toBe('$19.99');
  });

  it('formats zero', () => {
    expect(formatCents(0)).toBe('$0.00');
  });

  it('formats large amounts', () => {
    expect(formatCents(999900)).toBe('$9999.00');
  });
});

describe('formatCentsDecimal', () => {
  it('returns plain decimal without dollar sign', () => {
    expect(formatCentsDecimal(2550)).toBe('25.50');
  });
});

describe('addCents', () => {
  it('adds two cent amounts', () => {
    expect(addCents(2500, 550)).toBe(3050);
  });

  it('handles zero', () => {
    expect(addCents(2500, 0)).toBe(2500);
  });
});
