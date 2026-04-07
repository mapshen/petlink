import { describe, it, expect } from 'vitest';
import { calculateBookingPrice, calculateAdvancedPrice, isUSHoliday, isPuppy } from './pricing';

/**
 * All monetary values in these tests are in INTEGER CENTS.
 * e.g., 2500 = $25.00, 550 = $5.50
 */

describe('calculateBookingPrice (cents)', () => {
  it('returns base price for single pet', () => {
    expect(calculateBookingPrice(2500, 550, 1)).toBe(2500);
  });

  it('adds additional pet price for extra pets', () => {
    expect(calculateBookingPrice(2500, 550, 3)).toBe(3600); // 2500 + 2*550
  });

  it('returns zero for free service', () => {
    expect(calculateBookingPrice(0, 0, 3)).toBe(0);
  });

  it('integer arithmetic — no float rounding needed', () => {
    // $25.99 base + 2 extra at $5.50 = $36.99 = 3699 cents
    expect(calculateBookingPrice(2599, 550, 3)).toBe(3699);
  });
});

describe('isUSHoliday', () => {
  const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day));

  it('detects New Year Day', () => expect(isUSHoliday(d(2026, 1, 1))).toBe(true));
  it('detects July 4th', () => expect(isUSHoliday(d(2026, 7, 4))).toBe(true));
  it('detects Christmas', () => expect(isUSHoliday(d(2026, 12, 25))).toBe(true));
  it('detects Christmas Eve', () => expect(isUSHoliday(d(2026, 12, 24))).toBe(true));
  it('detects New Year Eve', () => expect(isUSHoliday(d(2026, 12, 31))).toBe(true));
  it('detects Thanksgiving', () => expect(isUSHoliday(d(2026, 11, 26))).toBe(true));
  it('detects Black Friday', () => expect(isUSHoliday(d(2026, 11, 27))).toBe(true));
  it('detects Memorial Day', () => expect(isUSHoliday(d(2026, 5, 25))).toBe(true));
  it('detects Labor Day', () => expect(isUSHoliday(d(2026, 9, 7))).toBe(true));
  it('returns false for regular day', () => expect(isUSHoliday(d(2026, 3, 15))).toBe(false));
  it('non-holiday Friday in November', () => expect(isUSHoliday(d(2026, 11, 6))).toBe(false));
});

describe('isPuppy', () => {
  it('true for age 0', () => expect(isPuppy(0)).toBe(true));
  it('true for fractional age', () => expect(isPuppy(0.5)).toBe(true));
  it('false for age 1', () => expect(isPuppy(1)).toBe(false));
  it('false for undefined', () => expect(isPuppy(undefined)).toBe(false));
});

describe('calculateAdvancedPrice (cents)', () => {
  it('uses base price by default', () => {
    const result = calculateAdvancedPrice({ basePriceCents: 2500, additionalPetPriceCents: 550, petCount: 1 });
    expect(result.totalCents).toBe(2500);
    expect(result.breakdown.baseCents).toBe(2500);
  });

  it('applies holiday rate', () => {
    const result = calculateAdvancedPrice({
      basePriceCents: 2500, additionalPetPriceCents: 550, petCount: 1,
      isHoliday: true, holidayRateCents: 3500,
    });
    expect(result.totalCents).toBe(3500);
    expect(result.breakdown.holidayApplied).toBe(true);
  });

  it('falls back to base when no holiday rate set', () => {
    const result = calculateAdvancedPrice({
      basePriceCents: 2500, additionalPetPriceCents: 550, petCount: 1,
      isHoliday: true,
    });
    expect(result.totalCents).toBe(2500);
    expect(result.breakdown.holidayApplied).toBe(false);
  });

  it('applies puppy rate', () => {
    const result = calculateAdvancedPrice({
      basePriceCents: 2500, additionalPetPriceCents: 550, petCount: 1,
      hasPuppy: true, puppyRateCents: 3000,
    });
    expect(result.totalCents).toBe(3000);
    expect(result.breakdown.puppyApplied).toBe(true);
  });

  it('holiday takes precedence over puppy', () => {
    const result = calculateAdvancedPrice({
      basePriceCents: 2500, additionalPetPriceCents: 550, petCount: 1,
      isHoliday: true, holidayRateCents: 4000,
      hasPuppy: true, puppyRateCents: 3000,
    });
    expect(result.totalCents).toBe(4000);
    expect(result.breakdown.holidayApplied).toBe(true);
    expect(result.breakdown.puppyApplied).toBe(false);
  });

  it('adds extra pets', () => {
    const result = calculateAdvancedPrice({ basePriceCents: 2500, additionalPetPriceCents: 550, petCount: 3 });
    expect(result.totalCents).toBe(3600); // 2500 + 2*550
    expect(result.breakdown.extraPetsCents).toBe(1100);
  });

  it('adds pickup/dropoff fee', () => {
    const result = calculateAdvancedPrice({
      basePriceCents: 2500, additionalPetPriceCents: 0, petCount: 1,
      pickupDropoff: true, pickupDropoffFeeCents: 1000,
    });
    expect(result.totalCents).toBe(3500);
    expect(result.breakdown.pickupDropoffCents).toBe(1000);
  });

  it('adds grooming addon fee', () => {
    const result = calculateAdvancedPrice({
      basePriceCents: 2500, additionalPetPriceCents: 0, petCount: 1,
      groomingAddon: true, groomingAddonFeeCents: 1500,
    });
    expect(result.totalCents).toBe(4000);
    expect(result.breakdown.groomingCents).toBe(1500);
  });

  it('combines all pricing components', () => {
    const result = calculateAdvancedPrice({
      basePriceCents: 2500, additionalPetPriceCents: 550, petCount: 2,
      isHoliday: true, holidayRateCents: 3500,
      pickupDropoff: true, pickupDropoffFeeCents: 1000,
      groomingAddon: true, groomingAddonFeeCents: 1500,
    });
    // Holiday: 3500 + 1 extra pet: 550 + pickup: 1000 + grooming: 1500 = 6550
    expect(result.totalCents).toBe(6550);
  });

  it('ignores add-ons when fees not set', () => {
    const result = calculateAdvancedPrice({
      basePriceCents: 2500, additionalPetPriceCents: 0, petCount: 1,
      pickupDropoff: true, groomingAddon: true,
    });
    expect(result.totalCents).toBe(2500);
  });
});

describe('calculateAdvancedPrice addons (cents)', () => {
  it('defaults addonsCents to 0 and addonDetails to [] when no addons provided', () => {
    const result = calculateAdvancedPrice({ basePriceCents: 2500, additionalPetPriceCents: 550, petCount: 1 });
    expect(result.breakdown.addonsCents).toBe(0);
    expect(result.breakdown.addonDetails).toEqual([]);
    expect(result.totalCents).toBe(2500);
  });

  it('defaults addonsCents to 0 when addons is empty array', () => {
    const result = calculateAdvancedPrice({
      basePriceCents: 2500, additionalPetPriceCents: 550, petCount: 1,
      addons: [],
    });
    expect(result.breakdown.addonsCents).toBe(0);
    expect(result.breakdown.addonDetails).toEqual([]);
    expect(result.totalCents).toBe(2500);
  });

  it('adds single addon to total', () => {
    const result = calculateAdvancedPrice({
      basePriceCents: 2500, additionalPetPriceCents: 0, petCount: 1,
      addons: [{ slug: 'nail-trim', priceCents: 800 }],
    });
    expect(result.totalCents).toBe(3300); // 2500 + 800
    expect(result.breakdown.addonsCents).toBe(800);
    expect(result.breakdown.addonDetails).toEqual([{ slug: 'nail-trim', priceCents: 800 }]);
  });

  it('sums multiple addons correctly', () => {
    const result = calculateAdvancedPrice({
      basePriceCents: 2500, additionalPetPriceCents: 0, petCount: 1,
      addons: [
        { slug: 'nail-trim', priceCents: 800 },
        { slug: 'teeth-brushing', priceCents: 500 },
        { slug: 'flea-treatment', priceCents: 1200 },
      ],
    });
    expect(result.totalCents).toBe(5000); // 2500 + 800 + 500 + 1200
    expect(result.breakdown.addonsCents).toBe(2500);
    expect(result.breakdown.addonDetails).toHaveLength(3);
  });

  it('handles addon with zero price (free addon)', () => {
    const result = calculateAdvancedPrice({
      basePriceCents: 2500, additionalPetPriceCents: 0, petCount: 1,
      addons: [{ slug: 'photo-update', priceCents: 0 }],
    });
    expect(result.totalCents).toBe(2500);
    expect(result.breakdown.addonsCents).toBe(0);
    expect(result.breakdown.addonDetails).toEqual([{ slug: 'photo-update', priceCents: 0 }]);
  });

  it('stacks addons with holiday rate + extra pets', () => {
    const result = calculateAdvancedPrice({
      basePriceCents: 2500, additionalPetPriceCents: 550, petCount: 3,
      isHoliday: true, holidayRateCents: 3500,
      addons: [
        { slug: 'nail-trim', priceCents: 800 },
        { slug: 'teeth-brushing', priceCents: 500 },
      ],
    });
    // Holiday base: 3500 + 2 extra pets: 1100 + addons: 1300 = 5900
    expect(result.totalCents).toBe(5900);
    expect(result.breakdown.baseCents).toBe(3500);
    expect(result.breakdown.extraPetsCents).toBe(1100);
    expect(result.breakdown.addonsCents).toBe(1300);
    expect(result.breakdown.holidayApplied).toBe(true);
    expect(result.breakdown.addonDetails).toEqual([
      { slug: 'nail-trim', priceCents: 800 },
      { slug: 'teeth-brushing', priceCents: 500 },
    ]);
  });
});

describe('calculateAdvancedPrice custom price (cents)', () => {
  it('overrides base price with custom price', () => {
    const result = calculateAdvancedPrice({
      basePriceCents: 2500, additionalPetPriceCents: 550, petCount: 1,
      customPriceCents: 4000,
    });
    expect(result.totalCents).toBe(4000);
    expect(result.breakdown.baseCents).toBe(4000);
    expect(result.breakdown.customPriceApplied).toBe(true);
  });

  it('custom price skips extra pet charges', () => {
    const result = calculateAdvancedPrice({
      basePriceCents: 2500, additionalPetPriceCents: 550, petCount: 3,
      customPriceCents: 5000,
    });
    // Custom price is all-inclusive — no extra pet fee
    expect(result.totalCents).toBe(5000);
    expect(result.breakdown.extraPetsCents).toBe(0);
  });

  it('custom price overrides holiday rate', () => {
    const result = calculateAdvancedPrice({
      basePriceCents: 2500, additionalPetPriceCents: 550, petCount: 1,
      isHoliday: true, holidayRateCents: 3500,
      customPriceCents: 6000,
    });
    expect(result.totalCents).toBe(6000);
    expect(result.breakdown.holidayApplied).toBe(false);
    expect(result.breakdown.customPriceApplied).toBe(true);
  });

  it('custom price still adds addons', () => {
    const result = calculateAdvancedPrice({
      basePriceCents: 2500, additionalPetPriceCents: 0, petCount: 1,
      customPriceCents: 3000,
      addons: [{ slug: 'nail-trim', priceCents: 800 }],
    });
    expect(result.totalCents).toBe(3800); // 3000 custom + 800 addon
    expect(result.breakdown.addonsCents).toBe(800);
  });

  it('custom price of 0 results in free service', () => {
    const result = calculateAdvancedPrice({
      basePriceCents: 2500, additionalPetPriceCents: 550, petCount: 2,
      customPriceCents: 0,
    });
    expect(result.totalCents).toBe(0);
    expect(result.breakdown.customPriceApplied).toBe(true);
  });

  it('without custom price, customPriceApplied is false', () => {
    const result = calculateAdvancedPrice({
      basePriceCents: 2500, additionalPetPriceCents: 550, petCount: 1,
    });
    expect(result.breakdown.customPriceApplied).toBe(false);
  });
});

describe('calculateAdvancedPrice loyalty discount (cents)', () => {
  it('applies percentage discount to total', () => {
    const result = calculateAdvancedPrice({
      basePriceCents: 5000, additionalPetPriceCents: 0, petCount: 1,
      discountPercent: 10,
      discountReason: 'Loyalty: 5+ bookings',
    });
    // 5000 - 10% = 4500
    expect(result.totalCents).toBe(4500);
    expect(result.breakdown.discountCents).toBe(500);
    expect(result.breakdown.discountPercent).toBe(10);
    expect(result.breakdown.discountReason).toBe('Loyalty: 5+ bookings');
  });

  it('applies discount after addons and extra pets', () => {
    const result = calculateAdvancedPrice({
      basePriceCents: 2500, additionalPetPriceCents: 550, petCount: 2,
      addons: [{ slug: 'nail-trim', priceCents: 800 }],
      discountPercent: 10,
      discountReason: 'Repeat customer',
    });
    // Subtotal: 2500 + 550 + 800 = 3850, discount: 385, total: 3465
    expect(result.totalCents).toBe(3465);
    expect(result.breakdown.discountCents).toBe(385);
  });

  it('no discount when percent is 0', () => {
    const result = calculateAdvancedPrice({
      basePriceCents: 5000, additionalPetPriceCents: 0, petCount: 1,
      discountPercent: 0,
    });
    expect(result.totalCents).toBe(5000);
    expect(result.breakdown.discountCents).toBe(0);
    expect(result.breakdown.discountReason).toBeNull();
  });

  it('caps discount at 50%', () => {
    const result = calculateAdvancedPrice({
      basePriceCents: 5000, additionalPetPriceCents: 0, petCount: 1,
      discountPercent: 60,
    });
    expect(result.totalCents).toBe(5000);
    expect(result.breakdown.discountCents).toBe(0);
  });

  it('combines custom price with discount', () => {
    const result = calculateAdvancedPrice({
      basePriceCents: 2500, additionalPetPriceCents: 550, petCount: 2,
      customPriceCents: 4000,
      discountPercent: 10,
      discountReason: 'VIP client',
    });
    // Custom: 4000 (no extra pet), discount 10%: 400, total: 3600
    expect(result.totalCents).toBe(3600);
    expect(result.breakdown.discountCents).toBe(400);
    expect(result.breakdown.customPriceApplied).toBe(true);
  });

  it('defaults discount fields when not provided', () => {
    const result = calculateAdvancedPrice({
      basePriceCents: 2500, additionalPetPriceCents: 0, petCount: 1,
    });
    expect(result.breakdown.discountCents).toBe(0);
    expect(result.breakdown.discountPercent).toBe(0);
    expect(result.breakdown.discountReason).toBeNull();
  });
});
