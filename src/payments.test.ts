import { describe, it, expect, vi, beforeAll } from 'vitest';

const mockAccounts = {
  create: vi.fn().mockResolvedValue({ id: 'acct_test123' }),
};
const mockAccountLinks = {
  create: vi.fn().mockResolvedValue({ url: 'https://connect.stripe.com/setup/e/test' }),
};
const mockPaymentIntents = {
  create: vi.fn().mockResolvedValue({ id: 'pi_test123', client_secret: 'pi_test123_secret_xyz' }),
  capture: vi.fn().mockResolvedValue({ id: 'pi_test123', status: 'succeeded' }),
  cancel: vi.fn().mockResolvedValue({ id: 'pi_test123', status: 'canceled' }),
};
const mockRefunds = {
  create: vi.fn().mockResolvedValue({ id: 're_test123', status: 'succeeded' }),
};
const mockWebhooks = {
  constructEvent: vi.fn().mockReturnValue({ type: 'payment_intent.succeeded', data: { object: { id: 'pi_test123' } } }),
};

vi.mock('stripe', () => {
  return {
    default: class MockStripe {
      accounts = mockAccounts;
      accountLinks = mockAccountLinks;
      paymentIntents = mockPaymentIntents;
      refunds = mockRefunds;
      webhooks = mockWebhooks;
    },
  };
});

describe('payments', () => {
  beforeAll(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_fake';
  });

  it('createConnectedAccount returns account id', async () => {
    const { createConnectedAccount } = await import('./payments.ts');
    const id = await createConnectedAccount('test@example.com');
    expect(id).toBe('acct_test123');
  });

  it('createAccountLink returns onboarding URL', async () => {
    const { createAccountLink } = await import('./payments.ts');
    const url = await createAccountLink('acct_test123', 'http://localhost:3000');
    expect(url).toContain('stripe.com');
  });

  it('createPaymentIntent returns client secret and id', async () => {
    const { createPaymentIntent } = await import('./payments.ts');
    const result = await createPaymentIntent(5000, 'acct_test123');
    expect(result.paymentIntentId).toBe('pi_test123');
    expect(result.clientSecret).toBe('pi_test123_secret_xyz');
  });

  it('capturePayment does not throw', async () => {
    const { capturePayment } = await import('./payments.ts');
    await expect(capturePayment('pi_test123')).resolves.not.toThrow();
  });

  it('cancelPayment does not throw', async () => {
    const { cancelPayment } = await import('./payments.ts');
    await expect(cancelPayment('pi_test123')).resolves.not.toThrow();
  });

  it('constructWebhookEvent returns event', async () => {
    const { constructWebhookEvent } = await import('./payments.ts');
    const event = constructWebhookEvent('body', 'sig');
    expect(event.type).toBe('payment_intent.succeeded');
  });

  it('refundPayment with partial amount calls refunds.create with amount', async () => {
    mockRefunds.create.mockClear();
    const { refundPayment } = await import('./payments.ts');
    await refundPayment('pi_test123', 2500);
    expect(mockRefunds.create).toHaveBeenCalledWith({
      payment_intent: 'pi_test123',
      amount: 2500,
    });
  });

  it('refundPayment without amount calls refunds.create for full refund', async () => {
    mockRefunds.create.mockClear();
    const { refundPayment } = await import('./payments.ts');
    await refundPayment('pi_test123');
    expect(mockRefunds.create).toHaveBeenCalledWith({
      payment_intent: 'pi_test123',
    });
  });
});
