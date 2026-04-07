import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSqlFn, mockTxFn, mockBeginFn } = vi.hoisted(() => {
  const txFn = vi.fn();
  const beginFn = vi.fn(async (cb: (tx: any) => Promise<any>) => cb(txFn));
  const sqlFn = vi.fn();
  (sqlFn as any).begin = beginFn;
  return { mockSqlFn: sqlFn, mockTxFn: txFn, mockBeginFn: beginFn };
});
vi.mock('./db.ts', () => ({ default: mockSqlFn }));
vi.mock('./logger.ts', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  createProPeriod,
  getActiveProPeriod,
  hasActiveProPeriod,
  expireProPeriod,
  cancelProPeriod,
  hasUsedTrial,
  markTrialUsed,
  getProPeriodWithDaysRemaining,
} from './pro-periods.ts';

describe('pro-periods', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('createProPeriod', () => {
    it('inserts a pro period and sets subscription_tier', async () => {
      const mockPeriod = { id: 1, user_id: 42, source: 'beta', status: 'active' };
      mockSqlFn.mockResolvedValueOnce([mockPeriod]); // INSERT
      mockSqlFn.mockResolvedValueOnce([]); // UPDATE users

      const result = await createProPeriod(42, 'beta', new Date('2027-01-01'));
      expect(result).toEqual(mockPeriod);
      expect(mockSqlFn).toHaveBeenCalledTimes(2);
    });

    it('uses provided transaction handle', async () => {
      const mockTx = vi.fn();
      const mockPeriod = { id: 2, user_id: 10, source: 'trial', status: 'active' };
      mockTx.mockResolvedValueOnce([mockPeriod]); // INSERT
      mockTx.mockResolvedValueOnce([]); // UPDATE users

      const result = await createProPeriod(10, 'trial', new Date('2027-06-01'), mockTx);
      expect(result).toEqual(mockPeriod);
      expect(mockTx).toHaveBeenCalledTimes(2);
      expect(mockSqlFn).not.toHaveBeenCalled();
    });
  });

  describe('getActiveProPeriod', () => {
    it('returns active period', async () => {
      const mockPeriod = { id: 1, user_id: 42, source: 'beta', status: 'active' };
      mockSqlFn.mockResolvedValueOnce([mockPeriod]);

      const result = await getActiveProPeriod(42);
      expect(result).toEqual(mockPeriod);
    });

    it('returns null when no active period', async () => {
      mockSqlFn.mockResolvedValueOnce([]);
      expect(await getActiveProPeriod(42)).toBeNull();
    });
  });

  describe('hasActiveProPeriod', () => {
    it('returns true when active period exists', async () => {
      mockSqlFn.mockResolvedValueOnce([{ id: 1 }]);
      expect(await hasActiveProPeriod(42)).toBe(true);
    });

    it('returns false when no active period', async () => {
      mockSqlFn.mockResolvedValueOnce([]);
      expect(await hasActiveProPeriod(42)).toBe(false);
    });
  });

  describe('expireProPeriod', () => {
    it('expires period and downgrades to free when no other periods or subscriptions', async () => {
      mockSqlFn.mockResolvedValueOnce([{ user_id: 42 }]); // UPDATE pro_periods
      mockSqlFn.mockResolvedValueOnce([]); // no other pro periods
      mockSqlFn.mockResolvedValueOnce([]); // no paid subscription
      mockSqlFn.mockResolvedValueOnce([]); // UPDATE users to free

      await expireProPeriod(1);
      expect(mockSqlFn).toHaveBeenCalledTimes(4);
    });

    it('does not downgrade when user has paid subscription', async () => {
      mockSqlFn.mockResolvedValueOnce([{ user_id: 42 }]); // UPDATE pro_periods
      mockSqlFn.mockResolvedValueOnce([]); // no other pro periods
      mockSqlFn.mockResolvedValueOnce([{ tier: 'pro' }]); // has paid subscription

      await expireProPeriod(1);
      expect(mockSqlFn).toHaveBeenCalledTimes(3); // no downgrade
    });

    it('does not downgrade when another active pro period exists', async () => {
      mockSqlFn.mockResolvedValueOnce([{ user_id: 42 }]); // UPDATE pro_periods
      mockSqlFn.mockResolvedValueOnce([{ id: 2 }]); // another active period

      await expireProPeriod(1);
      // Should not check paid sub or downgrade
      expect(mockSqlFn).toHaveBeenCalledTimes(2);
    });

    it('no-ops when period not found or already expired', async () => {
      mockSqlFn.mockResolvedValueOnce([]); // no period found

      await expireProPeriod(999);
      expect(mockSqlFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('cancelProPeriod', () => {
    it('cancels period and downgrades within transaction', async () => {
      mockTxFn.mockResolvedValueOnce([{ user_id: 42 }]); // UPDATE pro_periods
      mockTxFn.mockResolvedValueOnce([]); // no other pro periods
      mockTxFn.mockResolvedValueOnce([]); // no paid subscription
      mockTxFn.mockResolvedValueOnce([]); // UPDATE users to free

      await cancelProPeriod(1);
      expect(mockBeginFn).toHaveBeenCalledTimes(1);
      expect(mockTxFn).toHaveBeenCalledTimes(4);
    });
  });

  describe('hasUsedTrial', () => {
    it('returns true when trial used', async () => {
      mockSqlFn.mockResolvedValueOnce([{ pro_trial_used: true }]);
      expect(await hasUsedTrial(42)).toBe(true);
    });

    it('returns false when trial not used', async () => {
      mockSqlFn.mockResolvedValueOnce([{ pro_trial_used: false }]);
      expect(await hasUsedTrial(42)).toBe(false);
    });
  });

  describe('markTrialUsed', () => {
    it('sets pro_trial_used on user', async () => {
      mockSqlFn.mockResolvedValueOnce([]);
      await markTrialUsed(42);
      expect(mockSqlFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('getProPeriodWithDaysRemaining', () => {
    it('returns period with days_remaining computed', async () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 5);
      mockSqlFn.mockResolvedValueOnce([{
        id: 1,
        user_id: 42,
        source: 'trial',
        ends_at: tomorrow.toISOString(),
        status: 'active',
      }]);

      const result = await getProPeriodWithDaysRemaining(42);
      expect(result).not.toBeNull();
      expect(result!.days_remaining).toBeGreaterThanOrEqual(4);
      expect(result!.days_remaining).toBeLessThanOrEqual(6);
    });

    it('returns null when no active period', async () => {
      mockSqlFn.mockResolvedValueOnce([]);
      expect(await getProPeriodWithDaysRemaining(42)).toBeNull();
    });
  });
});
