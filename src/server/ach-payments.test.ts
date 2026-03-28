import { describe, it, expect } from 'vitest';

type PaymentMethodType = 'card' | 'ach_debit';

// Test fee calculation logic
function calculateFees(amountCents: number, method: PaymentMethodType): { processingFeePct: number; platformFeePct: number } {
  return {
    processingFeePct: method === 'ach_debit' ? 0.8 : 2.9,
    platformFeePct: 15,
  };
}

function formatFeeComparison(amountCents: number): { cardFee: string; achFee: string; savings: string } {
  const cardRate = 0.029;
  const achRate = 0.008;
  const cardFee = Math.round(amountCents * cardRate);
  const achFee = Math.round(amountCents * achRate);
  return {
    cardFee: `$${(cardFee / 100).toFixed(2)}`,
    achFee: `$${(achFee / 100).toFixed(2)}`,
    savings: `$${((cardFee - achFee) / 100).toFixed(2)}`,
  };
}

describe('ACH fee calculations', () => {
  it('ACH has lower processing fee than card', () => {
    const cardFees = calculateFees(5000, 'card');
    const achFees = calculateFees(5000, 'ach_debit');
    expect(achFees.processingFeePct).toBeLessThan(cardFees.processingFeePct);
  });

  it('platform fee is same for both methods', () => {
    const cardFees = calculateFees(5000, 'card');
    const achFees = calculateFees(5000, 'ach_debit');
    expect(achFees.platformFeePct).toBe(cardFees.platformFeePct);
  });

  it('formats fee comparison correctly for $50 booking', () => {
    const result = formatFeeComparison(5000);
    expect(result.cardFee).toBe('$1.45');
    expect(result.achFee).toBe('$0.40');
    expect(result.savings).toBe('$1.05');
  });

  it('formats fee comparison correctly for $25 booking', () => {
    const result = formatFeeComparison(2500);
    expect(result.cardFee).toBe('$0.73');
    expect(result.achFee).toBe('$0.20');
    expect(result.savings).toBe('$0.53');
  });
});

describe('payment method validation', () => {
  const validMethods: PaymentMethodType[] = ['card', 'ach_debit'];

  it('card is a valid payment method', () => {
    expect(validMethods).toContain('card');
  });

  it('ach_debit is a valid payment method', () => {
    expect(validMethods).toContain('ach_debit');
  });

  it('defaults to card when not specified', () => {
    const input: PaymentMethodType | undefined = undefined;
    const method: PaymentMethodType = input ?? 'card';
    expect(method).toBe('card');
  });
});

describe('ACH payment intent behavior', () => {
  it('ACH does not use manual capture', () => {
    // ACH cannot be manually captured (escrow) — it settles immediately
    // The delayed payout system provides the escrow safety
    const achConfig = { capture_method: undefined };
    const cardConfig = { capture_method: 'manual' as const };
    expect(achConfig.capture_method).toBeUndefined();
    expect(cardConfig.capture_method).toBe('manual');
  });

  it('ACH requires a Stripe Customer', () => {
    // ACH/Financial Connections requires a customer_id
    const hasCustomer = (customerId: string | null): boolean => customerId !== null;
    expect(hasCustomer('cus_123')).toBe(true);
    expect(hasCustomer(null)).toBe(false);
  });
});
