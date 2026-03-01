import { describe, it, expect } from 'vitest';
import { calculateBookingPrice } from './multi-pet-pricing.ts';

describe('calculateBookingPrice', () => {
  it('returns base price for 1 pet', () => {
    expect(calculateBookingPrice(25, 5, 1)).toBe(25);
  });

  it('adds additional pet price for 2 pets', () => {
    expect(calculateBookingPrice(25, 5, 2)).toBe(30);
  });

  it('adds additional pet price for 3 pets', () => {
    expect(calculateBookingPrice(25, 5, 3)).toBe(35);
  });

  it('returns base price when additional_pet_price is 0', () => {
    expect(calculateBookingPrice(25, 0, 5)).toBe(25);
  });

  it('returns 0 for free services (meet_greet)', () => {
    expect(calculateBookingPrice(0, 0, 3)).toBe(0);
  });

  it('handles 1 pet with no extra charge', () => {
    expect(calculateBookingPrice(50, 10, 1)).toBe(50);
  });

  it('rounds to 2 decimal places', () => {
    expect(calculateBookingPrice(25.99, 5.50, 3)).toBe(36.99);
  });
});
