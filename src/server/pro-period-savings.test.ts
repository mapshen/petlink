import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSqlFn = vi.hoisted(() => vi.fn());
vi.mock('./db.ts', () => ({ default: mockSqlFn }));

const mockGetActiveProPeriod = vi.fn();
vi.mock('./pro-periods.ts', () => ({
  getActiveProPeriod: (...args: any[]) => mockGetActiveProPeriod(...args),
}));

vi.mock('./logger.ts', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { getProPeriodSavings } from './pro-period-savings.ts';

describe('pro-period-savings', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null when no active period', async () => {
    mockGetActiveProPeriod.mockResolvedValueOnce(null);
    expect(await getProPeriodSavings(42)).toBeNull();
  });

  it('calculates savings from completed bookings during period', async () => {
    mockGetActiveProPeriod.mockResolvedValueOnce({
      id: 1,
      user_id: 42,
      source: 'trial',
      starts_at: '2026-04-01T00:00:00Z',
      ends_at: '2026-07-01T00:00:00Z',
      status: 'active',
    });
    mockSqlFn.mockResolvedValueOnce([{ saved_cents: 1500, booking_count: 4 }]);

    const result = await getProPeriodSavings(42);
    expect(result).toEqual({
      saved_cents: 1500,
      booking_count: 4,
      period_source: 'trial',
      period_starts_at: '2026-04-01T00:00:00Z',
    });
  });

  it('returns zero savings when no bookings during period', async () => {
    mockGetActiveProPeriod.mockResolvedValueOnce({
      id: 2,
      user_id: 10,
      source: 'beta',
      starts_at: '2026-03-01T00:00:00Z',
      ends_at: '2026-12-31T00:00:00Z',
      status: 'active',
    });
    mockSqlFn.mockResolvedValueOnce([{ saved_cents: 0, booking_count: 0 }]);

    const result = await getProPeriodSavings(10);
    expect(result!.saved_cents).toBe(0);
    expect(result!.booking_count).toBe(0);
  });
});
