import { describe, it, expect } from 'vitest';
import { calculateAdvancedPrice, calculateStayDuration } from './pricing';

describe('calculateStayDuration', () => {
  it('1 night: check-in 3pm, check-out 10am next day', () => {
    const checkIn = new Date('2026-06-15T15:00:00Z');
    const checkOut = new Date('2026-06-16T10:00:00Z');
    const { nights, halfDays } = calculateStayDuration(checkIn, checkOut);
    expect(nights).toBe(1);
    expect(halfDays).toBe(1); // checkout before noon = half-day
  });

  it('2 nights: check-in 2pm, check-out 3pm two days later', () => {
    const checkIn = new Date('2026-06-15T14:00:00Z');
    const checkOut = new Date('2026-06-17T15:00:00Z');
    const { nights, halfDays } = calculateStayDuration(checkIn, checkOut);
    expect(nights).toBe(2);
    expect(halfDays).toBe(0); // checkout after noon = no half-day
  });

  it('1 night + half-day: check-in 9am, check-out 10am next day', () => {
    const checkIn = new Date('2026-06-15T09:00:00Z');
    const checkOut = new Date('2026-06-16T10:00:00Z');
    const { nights, halfDays } = calculateStayDuration(checkIn, checkOut);
    expect(nights).toBe(1);
    expect(halfDays).toBe(1); // checkout before noon
  });

  it('3 nights + half-day: check-in 10am Mon, check-out 10am Thu', () => {
    const checkIn = new Date('2026-06-15T10:00:00Z');
    const checkOut = new Date('2026-06-18T10:00:00Z');
    const { nights, halfDays } = calculateStayDuration(checkIn, checkOut);
    expect(nights).toBe(3);
    expect(halfDays).toBe(1); // checkout before noon
  });

  it('same-day booking = 0 nights, 1 half-day', () => {
    const checkIn = new Date('2026-06-15T14:00:00Z');
    const checkOut = new Date('2026-06-15T18:00:00Z');
    const { nights, halfDays } = calculateStayDuration(checkIn, checkOut);
    expect(nights).toBe(0);
    expect(halfDays).toBe(1);
  });

  it('7 nights, checkout after noon = no half-day', () => {
    const checkIn = new Date('2026-06-15T10:00:00Z');
    const checkOut = new Date('2026-06-22T15:00:00Z');
    const { nights, halfDays } = calculateStayDuration(checkIn, checkOut);
    expect(nights).toBe(7);
    expect(halfDays).toBe(0);
  });

  it('noon checkout = no half-day (at noon boundary)', () => {
    const checkIn = new Date('2026-06-15T12:00:00Z');
    const checkOut = new Date('2026-06-16T12:00:00Z');
    const { nights, halfDays } = calculateStayDuration(checkIn, checkOut);
    expect(nights).toBe(1);
    expect(halfDays).toBe(0);
  });

  it('midnight checkout = no half-day', () => {
    const checkIn = new Date('2026-06-15T10:00:00Z');
    const checkOut = new Date('2026-06-17T00:00:00Z');
    const { nights, halfDays } = calculateStayDuration(checkIn, checkOut);
    expect(nights).toBe(2);
    expect(halfDays).toBe(0);
  });
});

describe('calculateAdvancedPrice with nightly rates', () => {
  it('uses nightly rate * nights for sitting service', () => {
    const result = calculateAdvancedPrice({
      basePriceCents: 5000,
      additionalPetPriceCents: 1000,
      petCount: 1,
      nights: 3,
      halfDays: 0,
      nightlyRateCents: 5000,
      serviceType: 'sitting',
    });
    expect(result.totalCents).toBe(15000);
    expect(result.breakdown.nightsCents).toBe(15000);
    expect(result.breakdown.halfDaysCents).toBe(0);
  });

  it('adds half-day charges', () => {
    const result = calculateAdvancedPrice({
      basePriceCents: 5000,
      additionalPetPriceCents: 1000,
      petCount: 1,
      nights: 2,
      halfDays: 1,
      nightlyRateCents: 5000,
      halfDayRateCents: 2500,
      serviceType: 'sitting',
    });
    expect(result.totalCents).toBe(12500);
  });

  it('adds extra pet charges per night', () => {
    const result = calculateAdvancedPrice({
      basePriceCents: 5000,
      additionalPetPriceCents: 1000,
      petCount: 3,
      nights: 2,
      halfDays: 0,
      nightlyRateCents: 5000,
      serviceType: 'sitting',
    });
    expect(result.totalCents).toBe(14000);
    expect(result.breakdown.extraPetsCents).toBe(4000);
  });

  it('falls back to flat pricing when no nightly rate set', () => {
    const result = calculateAdvancedPrice({
      basePriceCents: 5000,
      additionalPetPriceCents: 1000,
      petCount: 1,
      nights: 3,
      halfDays: 0,
      serviceType: 'sitting',
    });
    expect(result.totalCents).toBe(5000);
  });

  it('walking service ignores nightly rate (flat pricing)', () => {
    const result = calculateAdvancedPrice({
      basePriceCents: 2500,
      additionalPetPriceCents: 550,
      petCount: 1,
      nights: 0,
      halfDays: 0,
      nightlyRateCents: 5000,
      serviceType: 'walking',
    });
    expect(result.totalCents).toBe(2500);
  });

  it('daycare service uses nightly rate', () => {
    const result = calculateAdvancedPrice({
      basePriceCents: 4000,
      additionalPetPriceCents: 500,
      petCount: 1,
      nights: 1,
      halfDays: 0,
      nightlyRateCents: 4000,
      serviceType: 'daycare',
    });
    expect(result.totalCents).toBe(4000);
  });

  it('stacks nightly rate with addons', () => {
    const result = calculateAdvancedPrice({
      basePriceCents: 5000,
      additionalPetPriceCents: 0,
      petCount: 1,
      nights: 3,
      halfDays: 0,
      nightlyRateCents: 5000,
      serviceType: 'sitting',
      addons: [{ slug: 'nail-trim', priceCents: 800 }],
    });
    expect(result.totalCents).toBe(15800);
  });

  it('applies holiday rate as nightly override', () => {
    const result = calculateAdvancedPrice({
      basePriceCents: 5000,
      additionalPetPriceCents: 0,
      petCount: 1,
      nights: 2,
      halfDays: 0,
      nightlyRateCents: 5000,
      holidayRateCents: 7000,
      isHoliday: true,
      serviceType: 'sitting',
    });
    expect(result.totalCents).toBe(14000);
    expect(result.breakdown.holidayApplied).toBe(true);
  });

  it('half-day defaults to half of nightly rate when not explicitly set', () => {
    const result = calculateAdvancedPrice({
      basePriceCents: 5000,
      additionalPetPriceCents: 0,
      petCount: 1,
      nights: 1,
      halfDays: 1,
      nightlyRateCents: 6000,
      serviceType: 'sitting',
    });
    expect(result.totalCents).toBe(9000);
    expect(result.breakdown.halfDaysCents).toBe(3000);
  });

  it('existing flat-rate bookings unchanged (no nights/serviceType)', () => {
    const result = calculateAdvancedPrice({
      basePriceCents: 2500,
      additionalPetPriceCents: 550,
      petCount: 2,
    });
    expect(result.totalCents).toBe(3050);
  });
});
