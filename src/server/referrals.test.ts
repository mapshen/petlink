import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSqlFn, mockTxFn, mockBeginFn } = vi.hoisted(() => {
  const txFn = vi.fn();
  const beginFn = vi.fn(async (cb: (tx: any) => Promise<any>) => cb(txFn));
  const sqlFn = vi.fn();
  (sqlFn as any).begin = beginFn;
  return { mockSqlFn: sqlFn, mockTxFn: txFn, mockBeginFn: beginFn };
});
vi.mock('./db.ts', () => ({ default: mockSqlFn }));

const mockIssueCredit = vi.fn();
vi.mock('./credits.ts', () => ({ issueCredit: (...args: any[]) => mockIssueCredit(...args) }));

vi.mock('./logger.ts', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  sanitizeError: (e: any) => e,
}));

import {
  generateReferralCode,
  getOrCreateReferralCode,
  applyReferralCode,
  completeReferral,
  getReferralStats,
  REFERRER_CREDIT_CENTS,
  REFERRED_CREDIT_CENTS,
  MAX_REFERRALS_PER_MONTH,
  REFERRAL_EXPIRY_DAYS,
} from './referrals.ts';

describe('referrals', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('generateReferralCode', () => {
    it('returns an 8-character alphanumeric string (no ambiguous chars)', () => {
      const code = generateReferralCode();
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
      expect(code).toHaveLength(8);
    });

    it('generates unique codes', () => {
      const codes = new Set(Array.from({ length: 100 }, () => generateReferralCode()));
      expect(codes.size).toBe(100);
    });
  });

  describe('constants', () => {
    it('has correct credit amounts', () => {
      expect(REFERRER_CREDIT_CENTS).toBe(1000); // $10
      expect(REFERRED_CREDIT_CENTS).toBe(500);  // $5
    });

    it('has correct limits', () => {
      expect(MAX_REFERRALS_PER_MONTH).toBe(20);
      expect(REFERRAL_EXPIRY_DAYS).toBe(90);
    });
  });

  describe('getOrCreateReferralCode', () => {
    it('returns existing code if user already has one', async () => {
      mockSqlFn.mockResolvedValueOnce([{ referral_code: 'ABCD1234' }]);
      const code = await getOrCreateReferralCode(42);
      expect(code).toBe('ABCD1234');
    });

    it('generates and stores a new code if user has none', async () => {
      mockSqlFn.mockResolvedValueOnce([{ referral_code: null }]);
      mockSqlFn.mockResolvedValueOnce([{ referral_code: 'NEW12345' }]);
      const code = await getOrCreateReferralCode(42);
      expect(code).toBe('NEW12345');
      expect(mockSqlFn).toHaveBeenCalledTimes(2);
    });
  });

  describe('applyReferralCode', () => {
    it('rejects self-referral', async () => {
      mockSqlFn.mockResolvedValueOnce([{ id: 42, referral_code: 'SELF1234' }]);
      const result = await applyReferralCode(42, 'SELF1234');
      expect(result).toEqual({ success: false, error: 'You cannot use your own referral code' });
    });

    it('rejects invalid code', async () => {
      mockSqlFn.mockResolvedValueOnce([]);
      const result = await applyReferralCode(42, 'INVALID1');
      expect(result).toEqual({ success: false, error: 'Invalid referral code' });
    });

    it('rejects if user was already referred', async () => {
      mockSqlFn.mockResolvedValueOnce([{ id: 99, referral_code: 'GOOD1234' }]);
      mockSqlFn.mockResolvedValueOnce([{ id: 1 }]); // existing referral
      const result = await applyReferralCode(42, 'GOOD1234');
      expect(result).toEqual({ success: false, error: 'You have already used a referral code' });
    });

    it('rejects if referrer hit monthly limit', async () => {
      mockSqlFn.mockResolvedValueOnce([{ id: 99, referral_code: 'GOOD1234' }]);
      mockSqlFn.mockResolvedValueOnce([]); // no existing referral for referred
      mockSqlFn.mockResolvedValueOnce([{ count: MAX_REFERRALS_PER_MONTH }]); // at limit
      const result = await applyReferralCode(42, 'GOOD1234');
      expect(result).toEqual({ success: false, error: 'This referral code has reached its monthly limit' });
    });

    it('creates a pending referral on success', async () => {
      mockSqlFn.mockResolvedValueOnce([{ id: 99, referral_code: 'GOOD1234' }]);
      mockSqlFn.mockResolvedValueOnce([]); // no existing referral
      mockSqlFn.mockResolvedValueOnce([{ count: 5 }]); // under limit
      const referral = { id: 1, referrer_id: 99, referred_id: 42, referral_code: 'GOOD1234', status: 'pending' };
      mockSqlFn.mockResolvedValueOnce([referral]);
      const result = await applyReferralCode(42, 'GOOD1234');
      expect(result).toEqual({ success: true, referral });
    });
  });

  describe('completeReferral', () => {
    it('does nothing if user has no pending referral', async () => {
      mockSqlFn.mockResolvedValueOnce([]); // no referral
      const result = await completeReferral(42);
      expect(result).toEqual({ completed: false });
      expect(mockIssueCredit).not.toHaveBeenCalled();
    });

    it('does nothing if user already has completed bookings before this one', async () => {
      mockSqlFn.mockResolvedValueOnce([{ id: 1, referrer_id: 99, referred_id: 42 }]); // pending referral
      mockSqlFn.mockResolvedValueOnce([{ count: 2 }]); // not first booking
      const result = await completeReferral(42);
      expect(result).toEqual({ completed: false });
    });

    it('issues credits to both parties on first completed booking', async () => {
      const referral = { id: 1, referrer_id: 99, referred_id: 42, referral_code: 'CODE1234' };
      mockSqlFn.mockResolvedValueOnce([referral]); // pending referral
      mockSqlFn.mockResolvedValueOnce([{ count: 1 }]); // first booking

      // Transaction mocks
      mockTxFn.mockResolvedValueOnce([{ id: 1 }]); // update referral status
      mockIssueCredit.mockResolvedValueOnce({ id: 10 }); // referrer credit
      mockIssueCredit.mockResolvedValueOnce({ id: 11 }); // referred credit

      const result = await completeReferral(42);
      expect(result).toEqual({ completed: true, referrerId: 99, referredId: 42 });
      expect(mockIssueCredit).toHaveBeenCalledTimes(2);
      expect(mockIssueCredit).toHaveBeenCalledWith(
        99, REFERRER_CREDIT_CENTS, 'referral', 'referral_invite',
        expect.stringContaining('referred a friend'), 1, expect.any(String), expect.anything()
      );
      expect(mockIssueCredit).toHaveBeenCalledWith(
        42, REFERRED_CREDIT_CENTS, 'referral', 'referral_invite',
        expect.stringContaining('Welcome bonus'), 1, expect.any(String), expect.anything()
      );
    });
  });

  describe('getReferralStats', () => {
    it('returns stats for a user', async () => {
      mockSqlFn
        .mockResolvedValueOnce([{ referral_code: 'CODE1234' }])
        .mockResolvedValueOnce([{ total: 10, pending: 3, completed: 7 }])
        .mockResolvedValueOnce([{ total_earned_cents: 7000 }]);

      const stats = await getReferralStats(42);
      expect(stats).toEqual({
        referral_code: 'CODE1234',
        total_referrals: 10,
        pending_referrals: 3,
        completed_referrals: 7,
        total_earned_cents: 7000,
      });
    });

    it('handles zero referrals', async () => {
      mockSqlFn
        .mockResolvedValueOnce([{ referral_code: 'CODE1234' }])
        .mockResolvedValueOnce([{ total: 0, pending: 0, completed: 0 }])
        .mockResolvedValueOnce([{ total_earned_cents: 0 }]);

      const stats = await getReferralStats(42);
      expect(stats).toEqual({
        referral_code: 'CODE1234',
        total_referrals: 0,
        pending_referrals: 0,
        completed_referrals: 0,
        total_earned_cents: 0,
      });
    });
  });
});
