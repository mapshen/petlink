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
    mockedSql.mockResolvedValueOnce([{ is_pro: true, roles: ['owner', 'sitter'] }] as any);
    const delay = await getPayoutDelay(42);
    expect(delay).toBe(1);
  });

  it('returns 3 days for standard sitters', async () => {
    mockedSql.mockResolvedValueOnce([{ is_pro: false, roles: ['owner', 'sitter'] }] as any);
    const delay = await getPayoutDelay(42);
    expect(delay).toBe(3);
  });

  it('returns 3 days when is_pro is null/undefined', async () => {
    mockedSql.mockResolvedValueOnce([{ is_pro: null, roles: ['owner', 'sitter'] }] as any);
    const delay = await getPayoutDelay(42);
    expect(delay).toBe(3);
  });

  it('throws when sitter not found', async () => {
    mockedSql.mockResolvedValueOnce([] as any);
    await expect(getPayoutDelay(999)).rejects.toThrow('Sitter not found: 999');
  });

  it('throws when user is not a sitter', async () => {
    mockedSql.mockResolvedValueOnce([{ is_pro: false, roles: ['owner'] }] as any);
    await expect(getPayoutDelay(42)).rejects.toThrow('User 42 is not a sitter');
  });
});

describe('schedulePayoutForBooking', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates payout record with amount in cents and correct scheduled_at', async () => {
    const now = new Date('2026-03-24T12:00:00Z');
    vi.setSystemTime(now);

    const expectedScheduled = new Date('2026-03-27T12:00:00Z');
    const fakePayout = {
      id: 1,
      booking_id: 10,
      sitter_id: 5,
      amount_cents: 5000,
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
    expect(result.amount_cents).toBe(5000);
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
      amount_cents: 7500,
      status: 'pending',
      scheduled_at: expectedScheduled.toISOString(),
      processed_at: null,
      stripe_transfer_id: null,
      created_at: now.toISOString(),
    };
    mockedSql.mockResolvedValueOnce([fakePayout] as any);

    const result = await schedulePayoutForBooking(20, 7, 75.0, 1);

    expect(result.amount_cents).toBe(7500);
    expect(new Date(result.scheduled_at).getTime()).toBe(expectedScheduled.getTime());

    vi.useRealTimers();
  });

  it('throws when payout already exists for booking (ON CONFLICT returns no rows)', async () => {
    mockedSql.mockResolvedValueOnce([] as any);

    await expect(schedulePayoutForBooking(10, 5, 50.0, 3)).rejects.toThrow(
      'Payout already exists for booking 10'
    );
  });

  it('converts fractional amounts to cents correctly', async () => {
    const now = new Date('2026-03-24T12:00:00Z');
    vi.setSystemTime(now);

    const fakePayout = {
      id: 3,
      booking_id: 30,
      sitter_id: 8,
      amount_cents: 2999,
      status: 'pending',
      scheduled_at: new Date('2026-03-27T12:00:00Z').toISOString(),
      processed_at: null,
      stripe_transfer_id: null,
      created_at: now.toISOString(),
    };
    mockedSql.mockResolvedValueOnce([fakePayout] as any);

    const result = await schedulePayoutForBooking(30, 8, 29.99, 3);
    expect(result.amount_cents).toBe(2999);

    vi.useRealTimers();
  });
});

describe('getPendingPayouts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns payouts where scheduled_at <= now and status is pending', async () => {
    const payouts = [
      { id: 1, status: 'pending', scheduled_at: '2026-03-20T00:00:00Z', amount_cents: 5000 },
      { id: 2, status: 'pending', scheduled_at: '2026-03-21T00:00:00Z', amount_cents: 7500 },
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
      { id: 3, sitter_id: 5, status: 'completed', created_at: '2026-03-23T00:00:00Z', amount_cents: 5000 },
      { id: 1, sitter_id: 5, status: 'pending', created_at: '2026-03-20T00:00:00Z', amount_cents: 7500 },
    ];
    mockedSql.mockResolvedValueOnce(payouts as any);

    const result = await getPayoutsForSitter(5);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(3);
  });

  it('accepts custom limit and offset for pagination', async () => {
    mockedSql.mockResolvedValueOnce([] as any);

    await getPayoutsForSitter(5, 10, 20);
    expect(mockedSql).toHaveBeenCalledTimes(1);
  });
});

describe('getPendingPayoutsForSitter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns only pending payouts for a sitter', async () => {
    const payouts = [
      { id: 2, sitter_id: 5, status: 'pending', scheduled_at: '2026-03-25T00:00:00Z', amount_cents: 5000 },
    ];
    mockedSql.mockResolvedValueOnce(payouts as any);

    const result = await getPendingPayoutsForSitter(5);
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('pending');
  });
});
