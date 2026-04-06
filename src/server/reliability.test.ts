import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSqlFn, mockTxFn, mockBeginFn } = vi.hoisted(() => {
  const txFn = vi.fn();
  const beginFn = vi.fn(async (cb: (tx: any) => Promise<any>) => cb(txFn));
  const sqlFn = vi.fn();
  (sqlFn as any).begin = beginFn;
  return { mockSqlFn: sqlFn, mockTxFn: txFn, mockBeginFn: beginFn };
});
vi.mock('./db.ts', () => ({ default: mockSqlFn }));
const mockCreateNotification = vi.fn().mockResolvedValue({ id: 1 });
vi.mock('./notifications.ts', () => ({
  createNotification: (...args: any[]) => mockCreateNotification(...args),
}));
vi.mock('./logger.ts', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  recordStrike,
  getActiveStrikeWeight,
  getStrikeHistory,
  evaluateConsequences,
  getStrikeEventForCancellation,
} from './reliability.ts';

describe('reliability', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('recordStrike', () => {
    it('inserts strike with correct weight and computed expires_at', async () => {
      const fakeStrike = {
        id: 1, sitter_id: 42, booking_id: 10, event_type: 'sitter_cancel_24h',
        strike_weight: 1, description: 'test', created_at: '2026-04-06', expires_at: '2026-07-05',
      };
      mockSqlFn.mockResolvedValueOnce([fakeStrike]);

      const result = await recordStrike(42, 'sitter_cancel_24h', 'test', 10);
      expect(result.strike_weight).toBe(1);
      expect(result.event_type).toBe('sitter_cancel_24h');
    });

    it('returns existing strike on duplicate (ON CONFLICT)', async () => {
      mockSqlFn.mockResolvedValueOnce([]); // INSERT returns nothing (conflict)
      const existingStrike = { id: 1, sitter_id: 42, event_type: 'sitter_cancel_24h', strike_weight: 1 };
      mockSqlFn.mockResolvedValueOnce([existingStrike]); // SELECT existing

      const result = await recordStrike(42, 'sitter_cancel_24h', 'test', 10);
      expect(result.id).toBe(1);
    });

    it('uses correct weight for no-show events', async () => {
      const fakeStrike = { id: 2, sitter_id: 42, event_type: 'sitter_no_show', strike_weight: 2 };
      mockSqlFn.mockResolvedValueOnce([fakeStrike]);

      const result = await recordStrike(42, 'sitter_no_show', 'no show');
      expect(result.strike_weight).toBe(2);
    });

    it('accepts optional transaction handle', async () => {
      const fakeStrike = { id: 3, sitter_id: 42, event_type: 'sitter_cancel_48h', strike_weight: 0.5 };
      mockTxFn.mockResolvedValueOnce([fakeStrike]);

      const result = await recordStrike(42, 'sitter_cancel_48h', 'test', 10, mockTxFn);
      expect(result.strike_weight).toBe(0.5);
      expect(mockTxFn).toHaveBeenCalled();
      expect(mockSqlFn).not.toHaveBeenCalled();
    });
  });

  describe('getActiveStrikeWeight', () => {
    it('returns sum of non-expired strike weights', async () => {
      mockSqlFn.mockResolvedValueOnce([{ total: 3.5 }]);
      expect(await getActiveStrikeWeight(42)).toBe(3.5);
    });

    it('returns 0 when no strikes exist', async () => {
      mockSqlFn.mockResolvedValueOnce([{ total: 0 }]);
      expect(await getActiveStrikeWeight(42)).toBe(0);
    });
  });

  describe('getStrikeHistory', () => {
    it('returns paginated strike entries', async () => {
      const strikes = [{ id: 1, event_type: 'sitter_cancel_24h', strike_weight: 1 }];
      mockSqlFn.mockResolvedValueOnce(strikes);
      const result = await getStrikeHistory(42);
      expect(result).toHaveLength(1);
    });
  });

  describe('evaluateConsequences', () => {
    it('returns warning level at weight 1', async () => {
      mockSqlFn.mockResolvedValueOnce([{ total: 1 }]); // getActiveStrikeWeight
      mockSqlFn.mockResolvedValueOnce([{ reliability_level: 'none' }]); // SELECT user
      mockSqlFn.mockResolvedValueOnce([]); // UPDATE reliability_level

      const result = await evaluateConsequences(42);
      expect(result.level).toBe('warning');
      expect(mockCreateNotification).toHaveBeenCalled();
    });

    it('returns flagged level at weight 3', async () => {
      mockSqlFn.mockResolvedValueOnce([{ total: 3 }]);
      mockSqlFn.mockResolvedValueOnce([{ reliability_level: 'warning' }]);
      mockSqlFn.mockResolvedValueOnce([]);

      const result = await evaluateConsequences(42);
      expect(result.level).toBe('flagged');
    });

    it('returns demotion level at weight 5', async () => {
      mockSqlFn.mockResolvedValueOnce([{ total: 5 }]);
      mockSqlFn.mockResolvedValueOnce([{ reliability_level: 'flagged' }]);
      mockSqlFn.mockResolvedValueOnce([]);

      const result = await evaluateConsequences(42);
      expect(result.level).toBe('demotion');
    });

    it('suspends sitter at weight 7', async () => {
      mockSqlFn.mockResolvedValueOnce([{ total: 7 }]);
      mockSqlFn.mockResolvedValueOnce([{ reliability_level: 'demotion' }]);
      mockSqlFn.mockResolvedValueOnce([]); // UPDATE reliability_level
      mockSqlFn.mockResolvedValueOnce([]); // UPDATE approval_status

      const result = await evaluateConsequences(42);
      expect(result.level).toBe('suspension');
    });

    it('does not send notification when level unchanged', async () => {
      mockSqlFn.mockResolvedValueOnce([{ total: 1 }]);
      mockSqlFn.mockResolvedValueOnce([{ reliability_level: 'warning' }]); // same level

      const result = await evaluateConsequences(42);
      expect(result.level).toBe('warning');
      expect(mockCreateNotification).not.toHaveBeenCalled();
    });

    it('returns none below threshold', async () => {
      mockSqlFn.mockResolvedValueOnce([{ total: 0 }]);
      mockSqlFn.mockResolvedValueOnce([{ reliability_level: 'none' }]);

      const result = await evaluateConsequences(42);
      expect(result.level).toBe('none');
      expect(mockCreateNotification).not.toHaveBeenCalled();
    });
  });

  describe('getStrikeEventForCancellation', () => {
    it('returns sitter_cancel_24h when < 24 hours before start', () => {
      const start = new Date(Date.now() + 12 * 60 * 60 * 1000);
      expect(getStrikeEventForCancellation(start, new Date())).toBe('sitter_cancel_24h');
    });

    it('returns sitter_cancel_48h when 24-48 hours before start', () => {
      const start = new Date(Date.now() + 36 * 60 * 60 * 1000);
      expect(getStrikeEventForCancellation(start, new Date())).toBe('sitter_cancel_48h');
    });

    it('returns null when 48+ hours before start', () => {
      const start = new Date(Date.now() + 72 * 60 * 60 * 1000);
      expect(getStrikeEventForCancellation(start, new Date())).toBeNull();
    });

    it('returns sitter_cancel_24h when start time has passed', () => {
      const start = new Date(Date.now() - 60 * 60 * 1000);
      expect(getStrikeEventForCancellation(start, new Date())).toBe('sitter_cancel_24h');
    });

    it('returns sitter_cancel_48h at exactly 24 hours', () => {
      const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
      expect(getStrikeEventForCancellation(start, new Date())).toBe('sitter_cancel_48h');
    });

    it('returns null at exactly 48 hours', () => {
      const start = new Date(Date.now() + 48 * 60 * 60 * 1000);
      expect(getStrikeEventForCancellation(start, new Date())).toBeNull();
    });
  });
});

describe('computeReliabilityPenalty', () => {
  let computeReliabilityPenalty: (weight?: number) => number;

  beforeEach(async () => {
    const mod = await import('./sitter-ranking.ts');
    computeReliabilityPenalty = mod.computeReliabilityPenalty;
  });

  it('returns 0 for no strikes', () => expect(computeReliabilityPenalty(0)).toBe(0));
  it('returns 0 below threshold', () => expect(computeReliabilityPenalty(4.5)).toBe(0));
  it('returns 0.15 at 5+ strikes', () => expect(computeReliabilityPenalty(5)).toBe(0.15));
  it('returns 0.15 at 7+ strikes', () => expect(computeReliabilityPenalty(7)).toBe(0.15));
  it('returns 0 for undefined', () => expect(computeReliabilityPenalty(undefined)).toBe(0));
});
