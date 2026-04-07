import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSqlFn = vi.hoisted(() => {
  const fn = vi.fn();
  (fn as any).json = vi.fn((v: any) => v);
  return fn;
});
vi.mock('./db.ts', () => ({ default: mockSqlFn }));
vi.mock('./logger.ts', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { getSetting, setSetting, isBetaActive, getBetaEndDate, getProTrialDays, clearSettingsCache } from './platform-settings.ts';

describe('platform-settings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearSettingsCache();
  });

  describe('getSetting', () => {
    it('returns value from database', async () => {
      mockSqlFn.mockResolvedValueOnce([{ value: { active: true } }]);
      const result = await getSetting('beta_active');
      expect(result).toEqual({ active: true });
    });

    it('returns null when key not found', async () => {
      mockSqlFn.mockResolvedValueOnce([]);
      const result = await getSetting('nonexistent');
      expect(result).toBeNull();
    });

    it('caches results for subsequent calls', async () => {
      mockSqlFn.mockResolvedValueOnce([{ value: { days: 90 } }]);
      await getSetting('pro_trial_days');
      await getSetting('pro_trial_days');
      expect(mockSqlFn).toHaveBeenCalledTimes(1);
    });

    it('returns null on database error', async () => {
      mockSqlFn.mockRejectedValueOnce(new Error('db down'));
      const result = await getSetting('beta_active');
      expect(result).toBeNull();
    });
  });

  describe('setSetting', () => {
    it('upserts value and updates cache', async () => {
      mockSqlFn.mockResolvedValueOnce([]);
      await setSetting('beta_active', { active: false }, 1);
      expect(mockSqlFn).toHaveBeenCalledTimes(1);

      // Subsequent getSetting should use cache
      const result = await getSetting('beta_active');
      expect(result).toEqual({ active: false });
      expect(mockSqlFn).toHaveBeenCalledTimes(1); // no additional DB call
    });
  });

  describe('isBetaActive', () => {
    it('returns true when beta is active', async () => {
      mockSqlFn.mockResolvedValueOnce([{ value: { active: true } }]);
      expect(await isBetaActive()).toBe(true);
    });

    it('returns false when beta is inactive', async () => {
      mockSqlFn.mockResolvedValueOnce([{ value: { active: false } }]);
      expect(await isBetaActive()).toBe(false);
    });

    it('returns false when setting not found', async () => {
      mockSqlFn.mockResolvedValueOnce([]);
      expect(await isBetaActive()).toBe(false);
    });
  });

  describe('getBetaEndDate', () => {
    it('returns Date when set', async () => {
      mockSqlFn.mockResolvedValueOnce([{ value: { date: '2026-12-31' } }]);
      const result = await getBetaEndDate();
      expect(result).toBeInstanceOf(Date);
      expect(result!.getFullYear()).toBe(2026);
    });

    it('returns null when not set', async () => {
      mockSqlFn.mockResolvedValueOnce([]);
      expect(await getBetaEndDate()).toBeNull();
    });
  });

  describe('getProTrialDays', () => {
    it('returns configured days', async () => {
      mockSqlFn.mockResolvedValueOnce([{ value: { days: 60 } }]);
      expect(await getProTrialDays()).toBe(60);
    });

    it('defaults to 30 when not configured', async () => {
      mockSqlFn.mockResolvedValueOnce([]);
      expect(await getProTrialDays()).toBe(30);
    });
  });
});
