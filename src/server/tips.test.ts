import { describe, it, expect } from 'vitest';

const SUGGESTED_TIP_PERCENTS = [15, 20, 25];

function calculateSuggestedTips(bookingTotalCents: number): { percent: number; amount_cents: number }[] {
  return SUGGESTED_TIP_PERCENTS.map((percent) => ({
    percent,
    amount_cents: Math.round(bookingTotalCents * (percent / 100)),
  }));
}

function validateTipAmount(amountCents: number): { valid: boolean; error?: string } {
  if (!Number.isInteger(amountCents)) return { valid: false, error: 'Tip amount must be a whole number of cents' };
  if (amountCents <= 0) return { valid: false, error: 'Tip must be greater than $0' };
  if (amountCents > 100000) return { valid: false, error: 'Tip cannot exceed $1,000' }; // 100000 cents = $1000
  return { valid: true };
}

describe('calculateSuggestedTips', () => {
  it('calculates 15%, 20%, 25% of booking total', () => {
    const tips = calculateSuggestedTips(5000); // $50 booking
    expect(tips).toEqual([
      { percent: 15, amount_cents: 750 },
      { percent: 20, amount_cents: 1000 },
      { percent: 25, amount_cents: 1250 },
    ]);
  });

  it('rounds to nearest cent', () => {
    const tips = calculateSuggestedTips(3333); // $33.33 booking
    expect(tips[0].amount_cents).toBe(500);  // 15% of 3333 = 499.95 → 500
    expect(tips[1].amount_cents).toBe(667);  // 20% of 3333 = 666.6 → 667
    expect(tips[2].amount_cents).toBe(833);  // 25% of 3333 = 833.25 → 833
  });

  it('handles zero booking total', () => {
    const tips = calculateSuggestedTips(0);
    expect(tips.every((t) => t.amount_cents === 0)).toBe(true);
  });
});

describe('validateTipAmount', () => {
  it('accepts valid tip amount', () => {
    expect(validateTipAmount(500)).toEqual({ valid: true });
  });

  it('rejects zero', () => {
    expect(validateTipAmount(0).valid).toBe(false);
  });

  it('rejects negative', () => {
    expect(validateTipAmount(-100).valid).toBe(false);
  });

  it('rejects over $1000', () => {
    expect(validateTipAmount(100001).valid).toBe(false);
  });

  it('accepts $1000 exactly', () => {
    expect(validateTipAmount(100000)).toEqual({ valid: true });
  });

  it('rejects non-integer', () => {
    expect(validateTipAmount(10.5).valid).toBe(false);
  });
});
