import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db module before imports
const { mockSqlFn } = vi.hoisted(() => ({ mockSqlFn: vi.fn() }));
vi.mock('./db.ts', () => ({ default: mockSqlFn }));

import {
  getPayoutDelay,
  schedulePayoutForBooking,
  getPendingPayouts,
  getPayoutsForSitter,
  getPendingPayoutsForSitter,
} from './payouts.ts';

const mockedSql = mockSqlFn;

describe('getPayoutDelay', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 1 day for Pro sitters', async () => {
    mockedSql.mockResolvedValueOnce([{ is_pro: true }] as any);
    const delay = await getPayoutDelay(42);
    expect(delay).toBe(1);
  });

  it('returns 3 days for standard sitters', async () => {
    mockedSql.mockResolvedValueOnce([{ is_pro: false }] as any);
    const delay = await getPayoutDelay(42);
    expect(delay).toBe(3);
  });

  it('returns 3 days when is_pro is null/undefined', async () => {
    mockedSql.mockResolvedValueOnce([{ is_pro: null }] as any);
    const delay = await getPayoutDelay(42);
    expect(delay).toBe(3);
  });

  it('throws when sitter not found', async () => {
    mockedSql.mockResolvedValueOnce([] as any);
    await expect(getPayoutDelay(999)).rejects.toThrow('Sitter not found: 999');
  });
});

describe('schedulePayoutForBooking', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates payout record with correct scheduled_at', async () => {
    const now = new Date('2026-03-24T12:00:00Z');
    vi.setSystemTime(now);

    const expectedScheduled = new Date('2026-03-27T12:00:00Z');
    const fakePayout = {
      id: 1,
      booking_id: 10,
      sitter_id: 5,
      amount: 50.0,
      status: 'pending',
      scheduled_at: expectedScheduled.toISOString(),
      processed_at: null,
      stripe_transfer_id: null,
      created_at: now.toISOString(),
    };
    mockedSql.mockResolvedValueOnce([fakePayout] as any);

    const result = await schedulePayoutForBooking(10, 5, 50.0, 3);

    expect(result.booking_id).toBe(10);
    expect(result.sitter_id).toBe(5);
    expect(result.amount).toBe(50.0);
    expect(result.status).toBe('pending');
    expect(new Date(result.scheduled_at).getTime()).toBe(expectedScheduled.getTime());

    vi.useRealTimers();
  });

  it('creates payout with 1-day delay for Pro sitters', async () => {
    const now = new Date('2026-03-24T12:00:00Z');
    vi.setSystemTime(now);

    const expectedScheduled = new Date('2026-03-25T12:00:00Z');
    const fakePayout = {
      id: 2,
      booking_id: 20,
      sitter_id: 7,
      amount: 75.0,
      status: 'pending',
      scheduled_at: expectedScheduled.toISOString(),
      processed_at: null,
      stripe_transfer_id: null,
      created_at: now.toISOString(),
    };
    mockedSql.mockResolvedValueOnce([fakePayout] as any);

    const result = await schedulePayoutForBooking(20, 7, 75.0, 1);

    expect(result.amount).toBe(75.0);
    expect(new Date(result.scheduled_at).getTime()).toBe(expectedScheduled.getTime());

    vi.useRealTimers();
  });
});

describe('getPendingPayouts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns payouts where scheduled_at <= now and status is pending', async () => {
    const payouts = [
      { id: 1, status: 'pending', scheduled_at: '2026-03-20T00:00:00Z' },
      { id: 2, status: 'pending', scheduled_at: '2026-03-21T00:00:00Z' },
    ];
    mockedSql.mockResolvedValueOnce(payouts as any);

    const result = await getPendingPayouts();
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(1);
  });

  it('returns empty array when no pending payouts exist', async () => {
    mockedSql.mockResolvedValueOnce([] as any);

    const result = await getPendingPayouts();
    expect(result).toHaveLength(0);
  });
});

describe('getPayoutsForSitter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns all payouts for a sitter ordered by created_at desc', async () => {
    const payouts = [
      { id: 3, sitter_id: 5, status: 'completed', created_at: '2026-03-23T00:00:00Z' },
      { id: 1, sitter_id: 5, status: 'pending', created_at: '2026-03-20T00:00:00Z' },
    ];
    mockedSql.mockResolvedValueOnce(payouts as any);

    const result = await getPayoutsForSitter(5);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(3);
  });
});

describe('getPendingPayoutsForSitter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns only pending payouts for a sitter', async () => {
    const payouts = [
      { id: 2, sitter_id: 5, status: 'pending', scheduled_at: '2026-03-25T00:00:00Z' },
    ];
    mockedSql.mockResolvedValueOnce(payouts as any);

    const result = await getPendingPayoutsForSitter(5);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('pending');
  });
});
