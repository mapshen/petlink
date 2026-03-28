import { describe, it, expect, vi, beforeEach } from 'vitest';

// Test the customer management logic as a pure function
interface User {
  id: number;
  email: string;
  stripe_customer_id: string | null;
}

function shouldCreateCustomer(user: User): boolean {
  return !user.stripe_customer_id;
}

describe('shouldCreateCustomer', () => {
  it('returns true when no stripe_customer_id', () => {
    expect(shouldCreateCustomer({ id: 1, email: 'a@b.com', stripe_customer_id: null })).toBe(true);
  });

  it('returns false when customer already exists', () => {
    expect(shouldCreateCustomer({ id: 1, email: 'a@b.com', stripe_customer_id: 'cus_123' })).toBe(false);
  });
});
