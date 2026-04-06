import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db module before imports
const { mockSqlFn } = vi.hoisted(() => ({ mockSqlFn: vi.fn() }));
vi.mock('./db.ts', () => ({ default: mockSqlFn }));

import {
  recordPayoutForBooking,
  getPayoutsForSitter,
  getPendingPayoutsForSitter,
} from './payouts.ts';

const mockedSql = mockSqlFn;

describe('recordPayoutForBooking', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates payout tracking record with amount in cents', async () => {
    const now = new Date('2026-03-24T12:00:00Z');
    const fakePayout = {
      id: 1,
      booking_id: 10,
      sitter_id: 5,
      amount_cents: 5000,
      status: 'pending',
      scheduled_at: now.toISOString(),
      processed_at: null,
      stripe_transfer_id: null,
      created_at: now.toISOString(),
    };
    mockedSql.mockResolvedValueOnce([fakePayout] as any);

    const result = await recordPayoutForBooking(10, 5, 5000);

    expect(result.booking_id).toBe(10);
    expect(result.sitter_id).toBe(5);
    expect(result.amount_cents).toBe(5000);
    expect(result.status).toBe('pending');
  });

  it('throws when payout already exists for booking (ON CONFLICT returns no rows)', async () => {
    mockedSql.mockResolvedValueOnce([] as any);

    await expect(recordPayoutForBooking(10, 5, 5000)).rejects.toThrow(
      'Payout already exists for booking 10'
    );
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
