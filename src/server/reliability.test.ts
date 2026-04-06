import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSqlFn } = vi.hoisted(() => ({ mockSqlFn: vi.fn() }));
vi.mock('./db.ts', () => ({ default: mockSqlFn }));
vi.mock('./notifications.ts', () => ({
  createNotification: vi.fn().mockResolvedValue({ id: 1 }),
}));
vi.mock('./logger.ts', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  getActiveStrikeWeight,
  getStrikeHistory,
  getStrikeEventForCancellation,
} from './reliability.ts';

describe('reliability', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('getActiveStrikeWeight', () => {
    it('returns sum of non-expired strike weights', async () => {
      mockSqlFn.mockResolvedValueOnce([{ total: 3.5 }]);
      const weight = await getActiveStrikeWeight(42);
      expect(weight).toBe(3.5);
    });

    it('returns 0 when no strikes exist', async () => {
      mockSqlFn.mockResolvedValueOnce([{ total: 0 }]);
      const weight = await getActiveStrikeWeight(42);
      expect(weight).toBe(0);
    });
  });

  describe('getStrikeHistory', () => {
    it('returns paginated strike entries', async () => {
      const strikes = [
        { id: 1, sitter_id: 42, event_type: 'sitter_cancel_24h', strike_weight: 1, description: 'test' },
      ];
      mockSqlFn.mockResolvedValueOnce(strikes);
      const result = await getStrikeHistory(42);
      expect(result).toHaveLength(1);
      expect(result[0].event_type).toBe('sitter_cancel_24h');
    });
  });

  describe('getStrikeEventForCancellation', () => {
    it('returns sitter_cancel_24h when < 24 hours before start', () => {
      const start = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours from now
      const result = getStrikeEventForCancellation(start, new Date());
      expect(result).toBe('sitter_cancel_24h');
    });

    it('returns sitter_cancel_48h when 24-48 hours before start', () => {
      const start = new Date(Date.now() + 36 * 60 * 60 * 1000); // 36 hours from now
      const result = getStrikeEventForCancellation(start, new Date());
      expect(result).toBe('sitter_cancel_48h');
    });

    it('returns null when 48+ hours before start', () => {
      const start = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours from now
      const result = getStrikeEventForCancellation(start, new Date());
      expect(result).toBeNull();
    });

    it('returns sitter_cancel_24h when start time has already passed', () => {
      const start = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
      const result = getStrikeEventForCancellation(start, new Date());
      expect(result).toBe('sitter_cancel_24h');
    });
  });
});

describe('computeReliabilityPenalty', () => {
  // Import from sitter-ranking since that's where the function lives
  let computeReliabilityPenalty: (weight?: number) => number;

  beforeEach(async () => {
    const mod = await import('./sitter-ranking.ts');
    computeReliabilityPenalty = mod.computeReliabilityPenalty;
  });

  it('returns 0 for no strikes', () => {
    expect(computeReliabilityPenalty(0)).toBe(0);
  });

  it('returns 0 for strikes below threshold', () => {
    expect(computeReliabilityPenalty(4.5)).toBe(0);
  });

  it('returns 0.15 penalty for 5+ strikes', () => {
    expect(computeReliabilityPenalty(5)).toBe(0.15);
  });

  it('returns 0.15 penalty for 7+ strikes', () => {
    expect(computeReliabilityPenalty(7)).toBe(0.15);
  });

  it('returns 0 for undefined', () => {
    expect(computeReliabilityPenalty(undefined)).toBe(0);
  });
});
