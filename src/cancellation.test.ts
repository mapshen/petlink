import { describe, it, expect } from 'vitest';
import { calculateRefund, getPolicyDescription, POLICY_RULES } from './cancellation.ts';
import type { CancellationPolicy } from './types.ts';

describe('POLICY_RULES', () => {
  it('defines all three policies', () => {
    expect(POLICY_RULES).toHaveProperty('flexible');
    expect(POLICY_RULES).toHaveProperty('moderate');
    expect(POLICY_RULES).toHaveProperty('strict');
  });
});

describe('calculateRefund', () => {
  const baseTime = new Date('2026-03-15T14:00:00Z');

  // --- Flexible: full refund >= 24h before ---
  it('flexible: full refund when cancelled 25h before', () => {
    const cancelTime = new Date('2026-03-14T13:00:00Z'); // 25h before
    const result = calculateRefund('flexible', 5000, baseTime, cancelTime);
    expect(result.refundPercent).toBe(100);
    expect(result.refundAmount).toBe(5000);
    expect(result.eligible).toBe(true);
  });

  it('flexible: no refund when cancelled 23h before', () => {
    const cancelTime = new Date('2026-03-14T15:00:00Z'); // 23h before
    const result = calculateRefund('flexible', 5000, baseTime, cancelTime);
    expect(result.refundPercent).toBe(0);
    expect(result.refundAmount).toBe(0);
    expect(result.eligible).toBe(false);
  });

  it('flexible: full refund at exactly 24h boundary', () => {
    const cancelTime = new Date('2026-03-14T14:00:00Z'); // exactly 24h
    const result = calculateRefund('flexible', 5000, baseTime, cancelTime);
    expect(result.refundPercent).toBe(100);
    expect(result.refundAmount).toBe(5000);
    expect(result.eligible).toBe(true);
  });

  // --- Moderate: 50% refund >= 48h before ---
  it('moderate: 50% refund when cancelled 49h before', () => {
    const cancelTime = new Date('2026-03-13T13:00:00Z'); // 49h before
    const result = calculateRefund('moderate', 5000, baseTime, cancelTime);
    expect(result.refundPercent).toBe(50);
    expect(result.refundAmount).toBe(2500);
    expect(result.eligible).toBe(true);
  });

  it('moderate: no refund when cancelled 47h before', () => {
    const cancelTime = new Date('2026-03-13T15:00:00Z'); // 47h before
    const result = calculateRefund('moderate', 5000, baseTime, cancelTime);
    expect(result.refundPercent).toBe(0);
    expect(result.refundAmount).toBe(0);
    expect(result.eligible).toBe(false);
  });

  it('moderate: 50% refund at exactly 48h boundary', () => {
    const cancelTime = new Date('2026-03-13T14:00:00Z'); // exactly 48h
    const result = calculateRefund('moderate', 5000, baseTime, cancelTime);
    expect(result.refundPercent).toBe(50);
    expect(result.refundAmount).toBe(2500);
    expect(result.eligible).toBe(true);
  });

  // --- Strict: no refund < 7 days before ---
  it('strict: no refund when cancelled 8 days before', () => {
    const cancelTime = new Date('2026-03-07T14:00:00Z'); // 8 days before
    const result = calculateRefund('strict', 5000, baseTime, cancelTime);
    expect(result.refundPercent).toBe(0);
    expect(result.refundAmount).toBe(0);
    expect(result.eligible).toBe(false);
  });

  it('strict: no refund when cancelled 6 days before', () => {
    const cancelTime = new Date('2026-03-09T14:00:00Z'); // 6 days before
    const result = calculateRefund('strict', 5000, baseTime, cancelTime);
    expect(result.refundPercent).toBe(0);
    expect(result.refundAmount).toBe(0);
    expect(result.eligible).toBe(false);
  });

  // --- Edge cases ---
  it('returns 0 refund when totalPrice is 0', () => {
    const cancelTime = new Date('2026-03-14T12:00:00Z'); // well before
    const result = calculateRefund('flexible', 0, baseTime, cancelTime);
    expect(result.refundAmount).toBe(0);
    expect(result.refundPercent).toBe(100);
    expect(result.eligible).toBe(true);
  });

  it('rounds refund amount down for odd prices', () => {
    const cancelTime = new Date('2026-03-13T12:00:00Z'); // >48h
    const result = calculateRefund('moderate', 4999, baseTime, cancelTime);
    expect(result.refundAmount).toBe(2499); // floor(4999 * 0.5)
  });
});

describe('getPolicyDescription', () => {
  it('returns description for flexible', () => {
    const desc = getPolicyDescription('flexible');
    expect(desc).toContain('24');
    expect(desc.toLowerCase()).toContain('full refund');
  });

  it('returns description for moderate', () => {
    const desc = getPolicyDescription('moderate');
    expect(desc).toContain('48');
    expect(desc).toContain('50%');
  });

  it('returns description for strict', () => {
    const desc = getPolicyDescription('strict');
    expect(desc).toContain('7');
    expect(desc.toLowerCase()).toContain('no refund');
  });

  it('returns all three policies with different descriptions', () => {
    const policies: CancellationPolicy[] = ['flexible', 'moderate', 'strict'];
    const descriptions = policies.map(getPolicyDescription);
    expect(new Set(descriptions).size).toBe(3);
  });
});
