import { describe, it, expect } from 'vitest';

describe('PriceBreakdown data contracts', () => {
  const baseBreakdown = {
    baseCents: 2500,
    extraPetsCents: 0,
    pickupDropoffCents: 0,
    groomingCents: 0,
    addonDetails: [],
    discountCents: 0,
  };

  it('has required fields for a simple booking', () => {
    expect(baseBreakdown.baseCents).toBe(2500);
    expect(baseBreakdown.extraPetsCents).toBe(0);
    expect(baseBreakdown.addonDetails).toEqual([]);
  });

  it('supports extra pets pricing', () => {
    const withExtras = { ...baseBreakdown, extraPetsCents: 1000 };
    expect(withExtras.extraPetsCents).toBe(1000);
  });

  it('supports addon details', () => {
    const withAddons = {
      ...baseBreakdown,
      addonDetails: [
        { slug: 'pickup_dropoff', priceCents: 500 },
        { slug: 'medication_admin', priceCents: 300 },
      ],
    };
    expect(withAddons.addonDetails).toHaveLength(2);
  });

  it('supports loyalty discount', () => {
    const withDiscount = { ...baseBreakdown, discountCents: 375, discountPercent: 15 };
    expect(withDiscount.discountCents).toBe(375);
    expect(withDiscount.discountPercent).toBe(15);
  });

  it('supports holiday and puppy rate flags', () => {
    const holiday = { ...baseBreakdown, holidayApplied: true };
    const puppy = { ...baseBreakdown, puppyApplied: true };
    expect(holiday.holidayApplied).toBe(true);
    expect(puppy.puppyApplied).toBe(true);
  });
});
