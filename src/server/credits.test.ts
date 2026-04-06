import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSqlFn, mockTxFn, mockBeginFn } = vi.hoisted(() => {
  const txFn = vi.fn();
  const beginFn = vi.fn(async (cb: (tx: any) => Promise<any>) => cb(txFn));
  const sqlFn = vi.fn();
  (sqlFn as any).begin = beginFn;
  return { mockSqlFn: sqlFn, mockTxFn: txFn, mockBeginFn: beginFn };
});
vi.mock('./db.ts', () => ({ default: mockSqlFn }));

import {
  getBalance,
  getCreditHistory,
  issueCredit,
  applyCredits,
} from './credits.ts';

describe('credits', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('getBalance', () => {
    it('returns sum of non-expired credits', async () => {
      mockSqlFn.mockResolvedValueOnce([{ balance: 5000 }]);
      const balance = await getBalance(42);
      expect(balance).toBe(5000);
    });

    it('returns 0 when no credits exist', async () => {
      mockSqlFn.mockResolvedValueOnce([{ balance: 0 }]);
      const balance = await getBalance(42);
      expect(balance).toBe(0);
    });
  });

  describe('getCreditHistory', () => {
    it('returns paginated credit entries', async () => {
      const entries = [
        { id: 1, user_id: 42, amount_cents: 2000, type: 'promo', created_at: '2026-04-01' },
        { id: 2, user_id: 42, amount_cents: -500, type: 'redemption', created_at: '2026-04-02' },
      ];
      mockSqlFn.mockResolvedValueOnce(entries);

      const result = await getCreditHistory(42, 50, 0);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(1);
    });

    it('accepts custom limit and offset', async () => {
      mockSqlFn.mockResolvedValueOnce([]);
      await getCreditHistory(42, 10, 20);
      expect(mockSqlFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('issueCredit', () => {
    it('creates a positive credit entry', async () => {
      const entry = {
        id: 1,
        user_id: 42,
        amount_cents: 2000,
        type: 'dispute_resolution',
        source_type: 'dispute',
        source_id: 5,
        description: 'Credit from dispute #5',
        expires_at: null,
        created_at: '2026-04-06T12:00:00Z',
      };
      mockSqlFn.mockResolvedValueOnce([entry]);

      const result = await issueCredit(42, 2000, 'dispute_resolution', 'dispute', 'Credit from dispute #5', 5);
      expect(result.amount_cents).toBe(2000);
      expect(result.type).toBe('dispute_resolution');
      expect(result.source_id).toBe(5);
    });

    it('throws when amount is zero or negative', async () => {
      await expect(issueCredit(42, 0, 'promo', 'admin_grant', 'test')).rejects.toThrow('Credit amount must be positive');
      await expect(issueCredit(42, -100, 'promo', 'admin_grant', 'test')).rejects.toThrow('Credit amount must be positive');
    });
  });

  describe('applyCredits', () => {
    it('creates a negative redemption entry when sufficient balance', async () => {
      // Transaction: SELECT FOR UPDATE balance, then INSERT
      mockTxFn.mockResolvedValueOnce([{ balance: 5000 }]);
      const entry = {
        id: 2,
        user_id: 42,
        amount_cents: -2000,
        type: 'redemption',
        source_type: 'booking',
        source_id: 10,
        description: 'Applied to booking #10',
        expires_at: null,
        created_at: '2026-04-06T12:00:00Z',
      };
      mockTxFn.mockResolvedValueOnce([entry]);

      const result = await applyCredits(42, 2000, 'Applied to booking #10', 'booking', 10);
      expect(result.amount_cents).toBe(-2000);
      expect(result.type).toBe('redemption');
      expect(mockBeginFn).toHaveBeenCalledTimes(1);
    });

    it('throws when insufficient balance within transaction', async () => {
      mockTxFn.mockResolvedValueOnce([{ balance: 500 }]);
      await expect(applyCredits(42, 2000, 'test', 'booking')).rejects.toThrow('Insufficient credit balance');
    });

    it('throws when amount is zero or negative', async () => {
      await expect(applyCredits(42, 0, 'test', 'booking')).rejects.toThrow('Redemption amount must be positive');
      await expect(applyCredits(42, -100, 'test', 'booking')).rejects.toThrow('Redemption amount must be positive');
    });

    it('rejects when balance exactly equals zero', async () => {
      mockTxFn.mockResolvedValueOnce([{ balance: 0 }]);
      await expect(applyCredits(42, 100, 'test', 'booking')).rejects.toThrow('Insufficient credit balance');
    });

    it('allows applying exact balance amount', async () => {
      mockTxFn.mockResolvedValueOnce([{ balance: 2000 }]);
      const entry = { id: 3, user_id: 42, amount_cents: -2000, type: 'redemption', source_type: 'booking', source_id: null, description: 'test', expires_at: null, created_at: '2026-04-06' };
      mockTxFn.mockResolvedValueOnce([entry]);

      const result = await applyCredits(42, 2000, 'test', 'booking');
      expect(result.amount_cents).toBe(-2000);
    });
  });
});
