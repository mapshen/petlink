import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

const {
  mockSqlFn,
  mockAccountsCreate,
  mockAccountsRetrieve,
  mockAccountsUpdate,
  mockAccountLinksCreate,
  mockStripeInstance,
} = vi.hoisted(() => {
  const acCreate = vi.fn();
  const acRetrieve = vi.fn();
  const acUpdate = vi.fn();
  const alCreate = vi.fn();
  const instance = {
    accounts: { create: acCreate, retrieve: acRetrieve, update: acUpdate },
    accountLinks: { create: alCreate },
  };
  return {
    mockSqlFn: vi.fn(),
    mockAccountsCreate: acCreate,
    mockAccountsRetrieve: acRetrieve,
    mockAccountsUpdate: acUpdate,
    mockAccountLinksCreate: alCreate,
    mockStripeInstance: instance,
  };
});

vi.mock('./db.ts', () => ({ default: mockSqlFn }));
vi.mock('./logger.ts', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('./payments.ts', () => ({
  getStripe: () => mockStripeInstance,
}));

import {
  createConnectAccount,
  createAccountLink,
  syncConnectAccountStatus,
  handleAccountUpdated,
  updatePayoutSchedule,
  calculateApplicationFee,
  getConnectInfo,
} from './stripe-connect.ts';

describe('stripe-connect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createConnectAccount', () => {
    it('creates Express account and stores ID in database', async () => {
      mockAccountsCreate.mockResolvedValueOnce({ id: 'acct_test123' });
      // DB UPDATE call
      mockSqlFn.mockResolvedValueOnce([{ count: 1 }]);

      const result = await createConnectAccount(42, 'sitter@example.com');

      expect(result.stripeAccountId).toBe('acct_test123');
      expect(mockAccountsCreate).toHaveBeenCalledWith(expect.objectContaining({
        type: 'express',
        email: 'sitter@example.com',
        metadata: { petlink_user_id: '42' },
      }));
    });
  });

  describe('createAccountLink', () => {
    it('generates onboarding link with return and refresh URLs', async () => {
      mockAccountLinksCreate.mockResolvedValueOnce({
        url: 'https://connect.stripe.com/setup/test',
        expires_at: 1700000000,
      });

      const result = await createAccountLink(
        'acct_test123',
        'http://localhost:3000/connect/return',
        'http://localhost:3000/connect/refresh'
      );

      expect(result.url).toBe('https://connect.stripe.com/setup/test');
      expect(result.expiresAt).toBe(1700000000);
      expect(mockAccountLinksCreate).toHaveBeenCalledWith(expect.objectContaining({
        account: 'acct_test123',
        type: 'account_onboarding',
      }));
    });

    it('generates account_update link when type specified', async () => {
      mockAccountLinksCreate.mockResolvedValueOnce({
        url: 'https://connect.stripe.com/update/test',
        expires_at: 1700000000,
      });

      await createAccountLink(
        'acct_test123',
        'http://localhost:3000/connect/return',
        'http://localhost:3000/connect/refresh',
        'account_update'
      );

      expect(mockAccountLinksCreate).toHaveBeenCalledWith(expect.objectContaining({
        type: 'account_update',
      }));
    });
  });

  describe('syncConnectAccountStatus', () => {
    it('sets status to active when charges and payouts enabled', async () => {
      mockAccountsRetrieve.mockResolvedValueOnce({
        id: 'acct_test123',
        charges_enabled: true,
        payouts_enabled: true,
        requirements: { currently_due: [], disabled_reason: null },
      });
      mockSqlFn.mockResolvedValueOnce([{}]);

      const result = await syncConnectAccountStatus('acct_test123');

      expect(result.stripe_connect_status).toBe('active');
      expect(result.stripe_payouts_enabled).toBe(true);
      expect(result.stripe_charges_enabled).toBe(true);
    });

    it('sets status to onboarding when neither enabled', async () => {
      mockAccountsRetrieve.mockResolvedValueOnce({
        id: 'acct_test123',
        charges_enabled: false,
        payouts_enabled: false,
        requirements: { currently_due: ['individual.id_number'], disabled_reason: null },
      });
      mockSqlFn.mockResolvedValueOnce([{}]);

      const result = await syncConnectAccountStatus('acct_test123');

      expect(result.stripe_connect_status).toBe('onboarding');
    });

    it('sets status to restricted when partially enabled with requirements', async () => {
      mockAccountsRetrieve.mockResolvedValueOnce({
        id: 'acct_test123',
        charges_enabled: true,
        payouts_enabled: false,
        requirements: { currently_due: ['external_account'], disabled_reason: null },
      });
      mockSqlFn.mockResolvedValueOnce([{}]);

      const result = await syncConnectAccountStatus('acct_test123');

      expect(result.stripe_connect_status).toBe('restricted');
    });

    it('sets status to disabled when disabled_reason present', async () => {
      mockAccountsRetrieve.mockResolvedValueOnce({
        id: 'acct_test123',
        charges_enabled: false,
        payouts_enabled: false,
        requirements: { currently_due: [], disabled_reason: 'rejected.fraud' },
      });
      mockSqlFn.mockResolvedValueOnce([{}]);

      const result = await syncConnectAccountStatus('acct_test123');

      expect(result.stripe_connect_status).toBe('disabled');
    });
  });

  describe('handleAccountUpdated', () => {
    it('syncs account status from webhook event data', async () => {
      mockSqlFn.mockResolvedValueOnce([{}]);

      const result = await handleAccountUpdated({
        id: 'acct_test123',
        charges_enabled: true,
        payouts_enabled: true,
        requirements: { currently_due: [], disabled_reason: null },
      });

      expect(result.stripe_connect_status).toBe('active');
      expect(result.stripe_payouts_enabled).toBe(true);
    });

    it('sets disabled status when disabled_reason is present', async () => {
      mockSqlFn.mockResolvedValueOnce([{}]);

      const result = await handleAccountUpdated({
        id: 'acct_test123',
        charges_enabled: false,
        payouts_enabled: false,
        requirements: { currently_due: [], disabled_reason: 'rejected.other' },
      });

      expect(result.stripe_connect_status).toBe('disabled');
    });
  });

  describe('updatePayoutSchedule', () => {
    it('updates payout schedule on connected account', async () => {
      mockAccountsUpdate.mockResolvedValueOnce({});

      await updatePayoutSchedule('acct_test123', 3);

      expect(mockAccountsUpdate).toHaveBeenCalledWith('acct_test123', {
        settings: {
          payouts: {
            schedule: { delay_days: 3, interval: 'daily' },
          },
        },
      });
    });
  });

  describe('calculateApplicationFee', () => {
    it('returns 15% for free tier', () => {
      expect(calculateApplicationFee(10000, 'free')).toBe(1500);
    });

    it('returns 0 for pro tier', () => {
      expect(calculateApplicationFee(10000, 'pro')).toBe(0);
    });

    it('returns 0 for premium tier', () => {
      expect(calculateApplicationFee(10000, 'premium')).toBe(0);
    });

    it('rounds correctly for non-round amounts', () => {
      expect(calculateApplicationFee(4567, 'free')).toBe(685);
    });

    it('returns 15% for unknown/empty tier', () => {
      expect(calculateApplicationFee(10000, '')).toBe(1500);
    });
  });

  describe('getConnectInfo', () => {
    it('returns connect info for a user', async () => {
      mockSqlFn.mockResolvedValueOnce([{
        stripe_account_id: 'acct_test123',
        stripe_connect_status: 'active',
        stripe_payouts_enabled: true,
        stripe_charges_enabled: true,
      }]);

      const result = await getConnectInfo(42);

      expect(result.stripe_account_id).toBe('acct_test123');
      expect(result.stripe_connect_status).toBe('active');
      expect(result.stripe_payouts_enabled).toBe(true);
    });

    it('returns defaults when columns are null', async () => {
      mockSqlFn.mockResolvedValueOnce([{
        stripe_account_id: null,
        stripe_connect_status: null,
        stripe_payouts_enabled: null,
        stripe_charges_enabled: null,
      }]);

      const result = await getConnectInfo(42);

      expect(result.stripe_account_id).toBeNull();
      expect(result.stripe_connect_status).toBe('not_started');
      expect(result.stripe_payouts_enabled).toBe(false);
    });

    it('throws when user not found', async () => {
      mockSqlFn.mockImplementationOnce(() => Promise.resolve([]));

      await expect(getConnectInfo(999)).rejects.toThrow('User not found: 999');
    });
  });
});
