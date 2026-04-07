import { describe, it, expect } from 'vitest';
import { findApplicableTier, calculateLoyaltyDiscount, type LoyaltyTier } from './loyalty-discount';

describe('findApplicableTier', () => {
  const tiers: LoyaltyTier[] = [
    { sitter_id: 1, min_bookings: 3, discount_percent: 5 },
    { sitter_id: 1, min_bookings: 5, discount_percent: 10 },
    { sitter_id: 1, min_bookings: 10, discount_percent: 15 },
  ];

  it('returns null for empty tiers', () => {
    expect(findApplicableTier([], 5)).toBeNull();
  });

  it('returns null for 0 completed bookings', () => {
    expect(findApplicableTier(tiers, 0)).toBeNull();
  });

  it('returns null when no tier is reached', () => {
    expect(findApplicableTier(tiers, 2)).toBeNull();
  });

  it('returns the first tier at exact threshold', () => {
    const result = findApplicableTier(tiers, 3);
    expect(result).toEqual(tiers[0]);
  });

  it('returns the middle tier at its threshold', () => {
    const result = findApplicableTier(tiers, 5);
    expect(result).toEqual(tiers[1]);
  });

  it('returns the highest applicable tier when count exceeds all', () => {
    const result = findApplicableTier(tiers, 20);
    expect(result).toEqual(tiers[2]);
  });

  it('returns lower tier when between thresholds', () => {
    const result = findApplicableTier(tiers, 7);
    expect(result).toEqual(tiers[1]);
  });

  it('handles unsorted tiers correctly', () => {
    const unsorted: LoyaltyTier[] = [
      { sitter_id: 1, min_bookings: 10, discount_percent: 15 },
      { sitter_id: 1, min_bookings: 3, discount_percent: 5 },
      { sitter_id: 1, min_bookings: 5, discount_percent: 10 },
    ];
    const result = findApplicableTier(unsorted, 6);
    expect(result?.discount_percent).toBe(10);
  });

  it('does not mutate the original tiers array', () => {
    const original = [...tiers];
    findApplicableTier(tiers, 10);
    expect(tiers).toEqual(original);
  });
});

describe('calculateLoyaltyDiscount', () => {
  it('returns 0 for 0% discount', () => {
    expect(calculateLoyaltyDiscount(5000, 0)).toBe(0);
  });

  it('returns 0 for negative discount', () => {
    expect(calculateLoyaltyDiscount(5000, -5)).toBe(0);
  });

  it('returns 0 for discount over 50%', () => {
    expect(calculateLoyaltyDiscount(5000, 51)).toBe(0);
  });

  it('returns 0 for 0 total', () => {
    expect(calculateLoyaltyDiscount(0, 10)).toBe(0);
  });

  it('returns 0 for negative total', () => {
    expect(calculateLoyaltyDiscount(-100, 10)).toBe(0);
  });

  it('calculates 5% of $50.00 = $2.50 = 250 cents', () => {
    expect(calculateLoyaltyDiscount(5000, 5)).toBe(250);
  });

  it('calculates 10% of $25.00 = $2.50 = 250 cents', () => {
    expect(calculateLoyaltyDiscount(2500, 10)).toBe(250);
  });

  it('calculates 15% of $30.00 = $4.50 = 450 cents', () => {
    expect(calculateLoyaltyDiscount(3000, 15)).toBe(450);
  });

  it('rounds correctly for non-even amounts', () => {
    // 10% of $33.33 = $3.333 → 333 cents (rounded)
    expect(calculateLoyaltyDiscount(3333, 10)).toBe(333);
  });

  it('handles 50% max discount', () => {
    expect(calculateLoyaltyDiscount(5000, 50)).toBe(2500);
  });
});
