import { describe, it, expect } from 'vitest';
import { calculateBookingPrice, calculateAdvancedPrice, isUSHoliday, isPuppy } from './pricing';

describe('calculateBookingPrice (backwards compat)', () => {
  it('returns base price for single pet', () => {
    expect(calculateBookingPrice(25, 5, 1)).toBe(25);
  });

  it('adds additional pet price for extra pets', () => {
    expect(calculateBookingPrice(25, 5, 3)).toBe(35);
  });
});

describe('isUSHoliday', () => {
  // Use UTC dates to match the UTC-based implementation
  const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day));

  it('detects New Year Day', () => {
    expect(isUSHoliday(d(2026, 1, 1))).toBe(true);
  });

  it('detects July 4th', () => {
    expect(isUSHoliday(d(2026, 7, 4))).toBe(true);
  });

  it('detects Christmas', () => {
    expect(isUSHoliday(d(2026, 12, 25))).toBe(true);
  });

  it('detects Thanksgiving (4th Thursday of November)', () => {
    // 2026: Nov 26 is 4th Thursday
    expect(isUSHoliday(d(2026, 11, 26))).toBe(true);
  });

  it('detects Memorial Day (last Monday of May)', () => {
    // 2026: May 25 is last Monday
    expect(isUSHoliday(d(2026, 5, 25))).toBe(true);
  });

  it('detects Labor Day (first Monday of September)', () => {
    // 2026: Sep 7 is first Monday
    expect(isUSHoliday(d(2026, 9, 7))).toBe(true);
  });

  it('returns false for regular day', () => {
    expect(isUSHoliday(d(2026, 3, 15))).toBe(false);
  });

  it('detects New Year Eve', () => {
    expect(isUSHoliday(d(2026, 12, 31))).toBe(true);
  });

  it('detects Christmas Eve', () => {
    expect(isUSHoliday(d(2026, 12, 24))).toBe(true);
  });

  it('detects Black Friday (day after Thanksgiving)', () => {
    // 2026: Nov 27 is Black Friday
    expect(isUSHoliday(d(2026, 11, 27))).toBe(true);
  });

  it('does not flag a non-holiday Friday in November', () => {
    expect(isUSHoliday(d(2026, 11, 6))).toBe(false);
  });
});

describe('isPuppy', () => {
  it('returns true for pet under 1 year old', () => {
    expect(isPuppy(0)).toBe(true);
  });

  it('returns false for pet 1 year or older', () => {
    expect(isPuppy(1)).toBe(false);
    expect(isPuppy(3)).toBe(false);
  });

  it('returns false for undefined age', () => {
    expect(isPuppy(undefined)).toBe(false);
  });

  it('returns true for fractional age under 1', () => {
    expect(isPuppy(0.5)).toBe(true);
    expect(isPuppy(0.99)).toBe(true);
  });
});

describe('calculateAdvancedPrice', () => {
  it('uses base price by default', () => {
    const result = calculateAdvancedPrice({
      basePrice: 25, additionalPetPrice: 5, petCount: 1,
    });
    expect(result.total).toBe(25);
    expect(result.breakdown.base).toBe(25);
  });

  it('applies holiday rate when isHoliday and rate exists', () => {
    const result = calculateAdvancedPrice({
      basePrice: 25, additionalPetPrice: 5, petCount: 1,
      isHoliday: true, holidayRate: 35,
    });
    expect(result.total).toBe(35);
    expect(result.breakdown.base).toBe(35);
    expect(result.breakdown.holidayApplied).toBe(true);
  });

  it('falls back to base price when holiday rate is not set', () => {
    const result = calculateAdvancedPrice({
      basePrice: 25, additionalPetPrice: 5, petCount: 1,
      isHoliday: true,
    });
    expect(result.total).toBe(25);
    expect(result.breakdown.holidayApplied).toBe(false);
  });

  it('applies puppy rate when hasPuppy and rate exists', () => {
    const result = calculateAdvancedPrice({
      basePrice: 25, additionalPetPrice: 5, petCount: 1,
      hasPuppy: true, puppyRate: 30,
    });
    expect(result.total).toBe(30);
    expect(result.breakdown.base).toBe(30);
    expect(result.breakdown.puppyApplied).toBe(true);
  });

  it('holiday rate takes precedence over puppy rate', () => {
    const result = calculateAdvancedPrice({
      basePrice: 25, additionalPetPrice: 5, petCount: 1,
      isHoliday: true, holidayRate: 40,
      hasPuppy: true, puppyRate: 30,
    });
    expect(result.total).toBe(40);
    expect(result.breakdown.holidayApplied).toBe(true);
    expect(result.breakdown.puppyApplied).toBe(false);
  });

  it('adds extra pet pricing', () => {
    const result = calculateAdvancedPrice({
      basePrice: 25, additionalPetPrice: 5, petCount: 3,
    });
    expect(result.total).toBe(35);
    expect(result.breakdown.extraPets).toBe(10);
  });

  it('adds pickup/dropoff fee', () => {
    const result = calculateAdvancedPrice({
      basePrice: 25, additionalPetPrice: 0, petCount: 1,
      pickupDropoff: true, pickupDropoffFee: 10,
    });
    expect(result.total).toBe(35);
    expect(result.breakdown.pickupDropoff).toBe(10);
  });

  it('adds grooming addon fee', () => {
    const result = calculateAdvancedPrice({
      basePrice: 25, additionalPetPrice: 0, petCount: 1,
      groomingAddon: true, groomingAddonFee: 15,
    });
    expect(result.total).toBe(40);
    expect(result.breakdown.grooming).toBe(15);
  });

  it('combines all pricing components', () => {
    const result = calculateAdvancedPrice({
      basePrice: 25, additionalPetPrice: 5, petCount: 2,
      isHoliday: true, holidayRate: 35,
      pickupDropoff: true, pickupDropoffFee: 10,
      groomingAddon: true, groomingAddonFee: 15,
    });
    // Holiday base: 35 + 1 extra pet: 5 + pickup: 10 + grooming: 15 = 65
    expect(result.total).toBe(65);
    expect(result.breakdown.base).toBe(35);
    expect(result.breakdown.extraPets).toBe(5);
    expect(result.breakdown.pickupDropoff).toBe(10);
    expect(result.breakdown.grooming).toBe(15);
  });

  it('ignores add-ons when fees are not set', () => {
    const result = calculateAdvancedPrice({
      basePrice: 25, additionalPetPrice: 0, petCount: 1,
      pickupDropoff: true,
      groomingAddon: true,
    });
    expect(result.total).toBe(25);
  });

  it('rounds total to 2 decimal places', () => {
    const result = calculateAdvancedPrice({
      basePrice: 25.99, additionalPetPrice: 5.50, petCount: 3,
    });
    expect(result.total).toBe(36.99);
  });
});
