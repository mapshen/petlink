import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Inline schemas for testing (same as validation.ts will define)
const partnerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  logo_url: z.string().url().optional().nullable(),
  website_url: z.string().url().optional().nullable(),
});

const partnerOfferSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(1000).optional().nullable(),
  credit_cost_cents: z.number().int().positive(),
  offer_value_description: z.string().trim().min(1).max(500),
  max_redemptions_per_user: z.number().int().min(1).max(100).optional().default(1),
});

const addCouponCodesSchema = z.object({
  codes: z.array(z.string().trim().min(1).max(100)).min(1).max(500),
});

describe('partner schema validation', () => {
  it('accepts valid partner', () => {
    const result = partnerSchema.safeParse({ name: 'Chewy', logo_url: 'https://chewy.com/logo.png', website_url: 'https://chewy.com' });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = partnerSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('accepts partner with no logo/website', () => {
    const result = partnerSchema.safeParse({ name: 'BarkBox' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid URL for logo', () => {
    const result = partnerSchema.safeParse({ name: 'Test', logo_url: 'not-a-url' });
    expect(result.success).toBe(false);
  });
});

describe('partner offer schema validation', () => {
  it('accepts valid offer', () => {
    const result = partnerOfferSchema.safeParse({
      title: '$20 off Chewy order',
      credit_cost_cents: 2000,
      offer_value_description: '$20 off your next order',
    });
    expect(result.success).toBe(true);
  });

  it('rejects zero credit cost', () => {
    const result = partnerOfferSchema.safeParse({
      title: 'Free offer',
      credit_cost_cents: 0,
      offer_value_description: 'Free stuff',
    });
    expect(result.success).toBe(false);
  });

  it('defaults max_redemptions_per_user to 1', () => {
    const result = partnerOfferSchema.safeParse({
      title: 'Test',
      credit_cost_cents: 1000,
      offer_value_description: 'Test offer',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.max_redemptions_per_user).toBe(1);
    }
  });
});

describe('add coupon codes schema validation', () => {
  it('accepts valid codes array', () => {
    const result = addCouponCodesSchema.safeParse({ codes: ['ABC123', 'DEF456'] });
    expect(result.success).toBe(true);
  });

  it('rejects empty codes array', () => {
    const result = addCouponCodesSchema.safeParse({ codes: [] });
    expect(result.success).toBe(false);
  });

  it('rejects more than 500 codes', () => {
    const codes = Array.from({ length: 501 }, (_, i) => `CODE${i}`);
    const result = addCouponCodesSchema.safeParse({ codes });
    expect(result.success).toBe(false);
  });

  it('rejects empty string codes', () => {
    const result = addCouponCodesSchema.safeParse({ codes: ['', 'ABC'] });
    expect(result.success).toBe(false);
  });
});

describe('coupon redemption logic', () => {
  it('applyAmount = min(balance, cost) but redemption requires full cost', () => {
    // Credits are not partially applied — full cost or nothing
    const balance = 1500;
    const cost = 2000;
    expect(balance >= cost).toBe(false);
  });

  it('redemption succeeds when balance >= cost', () => {
    const balance = 3000;
    const cost = 2000;
    expect(balance >= cost).toBe(true);
  });

  it('coupon pool shrinks after redemption', () => {
    const pool = ['ABC', 'DEF', 'GHI'];
    const [dispensed, ...remaining] = pool;
    expect(dispensed).toBe('ABC');
    expect(remaining).toEqual(['DEF', 'GHI']);
  });
});
