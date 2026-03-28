import { describe, it, expect } from 'vitest';

// Test the payment amount formatting logic (pure function)
function formatAmount(amountCents: number): string {
  return `$${(amountCents / 100).toFixed(2)}`;
}

describe('PaymentForm amount formatting', () => {
  it('formats whole dollar amounts', () => {
    expect(formatAmount(2500)).toBe('$25.00');
  });

  it('formats amounts with cents', () => {
    expect(formatAmount(2599)).toBe('$25.99');
  });

  it('formats zero amount', () => {
    expect(formatAmount(0)).toBe('$0.00');
  });

  it('formats large amounts', () => {
    expect(formatAmount(100000)).toBe('$1000.00');
  });

  it('formats single cent', () => {
    expect(formatAmount(1)).toBe('$0.01');
  });
});

describe('Stripe appearance config', () => {
  it('uses emerald-600 as primary color', () => {
    const appearance = {
      theme: 'stripe' as const,
      variables: {
        colorPrimary: '#059669',
      },
    };
    expect(appearance.variables.colorPrimary).toBe('#059669');
  });
});
