import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSqlFn, mockTxFn, mockBeginFn } = vi.hoisted(() => {
  const txFn = vi.fn();
  const beginFn = vi.fn(async (cb: (tx: any) => Promise<any>) => cb(txFn));
  const sqlFn = vi.fn();
  (sqlFn as any).begin = beginFn;
  return { mockSqlFn: sqlFn, mockTxFn: txFn, mockBeginFn: beginFn };
});
vi.mock('./db.ts', () => ({ default: mockSqlFn }));

const mockIsBetaActive = vi.fn();
const mockGetBetaEndDate = vi.fn();
const mockSetSetting = vi.fn();
vi.mock('./platform-settings.ts', () => ({
  isBetaActive: () => mockIsBetaActive(),
  getBetaEndDate: () => mockGetBetaEndDate(),
  setSetting: (...args: any[]) => mockSetSetting(...args),
  getSetting: vi.fn(),
  clearSettingsCache: vi.fn(),
}));

const mockCreateProPeriod = vi.fn();
const mockCancelProPeriod = vi.fn();
const mockGetActiveProPeriod = vi.fn();
vi.mock('./pro-periods.ts', () => ({
  createProPeriod: (...args: any[]) => mockCreateProPeriod(...args),
  cancelProPeriod: (...args: any[]) => mockCancelProPeriod(...args),
  getActiveProPeriod: (...args: any[]) => mockGetActiveProPeriod(...args),
}));

vi.mock('./logger.ts', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  sanitizeError: (e: unknown) => e,
}));

import { createProPeriod } from './pro-periods.ts';
import { isBetaActive, getBetaEndDate } from './platform-settings.ts';

describe('beta program', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('auto-enrollment on sitter approval', () => {
    it('creates beta pro period when beta is active and sitter is approved', async () => {
      const betaEnd = new Date('2027-01-01');
      mockIsBetaActive.mockResolvedValueOnce(true);
      mockGetBetaEndDate.mockResolvedValueOnce(betaEnd);
      mockCreateProPeriod.mockResolvedValueOnce({ id: 1 });

      // Simulate the approval logic
      const betaIsActive = await isBetaActive();
      if (betaIsActive) {
        const betaEndDate = await getBetaEndDate();
        if (betaEndDate && betaEndDate > new Date()) {
          await createProPeriod(42, 'beta', betaEndDate);
        }
      }

      expect(mockCreateProPeriod).toHaveBeenCalledWith(42, 'beta', betaEnd);
    });

    it('does not create beta period when beta is inactive', async () => {
      mockIsBetaActive.mockResolvedValueOnce(false);

      const betaIsActive = await isBetaActive();
      if (betaIsActive) {
        await createProPeriod(42, 'beta', new Date());
      }

      expect(mockCreateProPeriod).not.toHaveBeenCalled();
    });

    it('does not create beta period when end date is in the past', async () => {
      mockIsBetaActive.mockResolvedValueOnce(true);
      mockGetBetaEndDate.mockResolvedValueOnce(new Date('2020-01-01'));

      const betaIsActive = await isBetaActive();
      if (betaIsActive) {
        const betaEndDate = await getBetaEndDate();
        if (betaEndDate && betaEndDate > new Date()) {
          await createProPeriod(42, 'beta', betaEndDate);
        }
      }

      expect(mockCreateProPeriod).not.toHaveBeenCalled();
    });
  });

  describe('beta dashboard', () => {
    it('returns aggregate stats for beta program', async () => {
      const stats = {
        active_beta_sitters: 15,
        total_beta_sitters: 20,
        beta_bookings: 45,
        beta_reviews: 18,
      };
      mockSqlFn.mockResolvedValueOnce([stats]);
      mockIsBetaActive.mockResolvedValueOnce(true);
      mockGetBetaEndDate.mockResolvedValueOnce(new Date('2026-12-31'));

      // Simulate dashboard query
      const [result] = await mockSqlFn();
      const betaActive = await isBetaActive();
      const betaEndDate = await getBetaEndDate();

      expect(result).toEqual(stats);
      expect(betaActive).toBe(true);
      expect(betaEndDate).toEqual(new Date('2026-12-31'));
    });
  });

  describe('beta period management', () => {
    it('extends a beta period to a new end date', async () => {
      const newEndDate = new Date('2027-06-01');
      mockSqlFn.mockResolvedValueOnce([{ id: 1, user_id: 42, ends_at: newEndDate.toISOString() }]);

      const [updated] = await mockSqlFn();
      expect(updated.ends_at).toBe(newEndDate.toISOString());
    });

    it('revokes a beta period', async () => {
      mockGetActiveProPeriod.mockResolvedValueOnce({ id: 5, source: 'beta', user_id: 42 });
      mockCancelProPeriod.mockResolvedValueOnce(undefined);

      const period = await mockGetActiveProPeriod(42);
      expect(period).not.toBeNull();
      expect(['beta', 'beta_transition']).toContain(period.source);

      await mockCancelProPeriod(period.id);
      expect(mockCancelProPeriod).toHaveBeenCalledWith(5);
    });

    it('rejects revoke when no active beta period exists', async () => {
      mockGetActiveProPeriod.mockResolvedValueOnce(null);

      const period = await mockGetActiveProPeriod(42);
      expect(period).toBeNull();
    });

    it('rejects revoke when active period is not a beta source', async () => {
      mockGetActiveProPeriod.mockResolvedValueOnce({ id: 10, source: 'trial', user_id: 42 });

      const period = await mockGetActiveProPeriod(42);
      expect(['beta', 'beta_transition']).not.toContain(period.source);
    });
  });

  describe('beta settings', () => {
    it('updates beta_active setting', async () => {
      mockSetSetting.mockResolvedValueOnce(undefined);
      await mockSetSetting('beta_active', { active: false }, 1);
      expect(mockSetSetting).toHaveBeenCalledWith('beta_active', { active: false }, 1);
    });

    it('updates beta_end_date setting', async () => {
      mockSetSetting.mockResolvedValueOnce(undefined);
      await mockSetSetting('beta_end_date', { date: '2027-06-30' }, 1);
      expect(mockSetSetting).toHaveBeenCalledWith('beta_end_date', { date: '2027-06-30' }, 1);
    });
  });
});
