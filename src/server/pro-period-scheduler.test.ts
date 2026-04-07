import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSqlFn, mockTxFn, mockBeginFn } = vi.hoisted(() => {
  const txFn = vi.fn();
  const beginFn = vi.fn(async (cb: (tx: any) => Promise<any>) => cb(txFn));
  const sqlFn = vi.fn();
  (sqlFn as any).begin = beginFn;
  return { mockSqlFn: sqlFn, mockTxFn: txFn, mockBeginFn: beginFn };
});
vi.mock('./db.ts', () => ({ default: mockSqlFn }));

const mockExpireProPeriod = vi.fn();
const mockCreateProPeriod = vi.fn();
vi.mock('./pro-periods.ts', () => ({
  expireProPeriod: (...args: unknown[]) => mockExpireProPeriod(...args),
  createProPeriod: (...args: unknown[]) => mockCreateProPeriod(...args),
}));

vi.mock('./platform-settings.ts', () => ({
  getBetaEndDate: vi.fn().mockResolvedValue(null),
}));

const mockSendEmail = vi.fn().mockResolvedValue({ id: 'msg_1' });
vi.mock('./email.ts', () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
  buildProTrialWarningEmail: vi.fn(() => ({ subject: 'Trial warning', html: '<p>warn</p>' })),
  buildBetaExpirationWarningEmail: vi.fn(() => ({ subject: 'Beta warning', html: '<p>beta</p>' })),
  buildProPeriodExpiredEmail: vi.fn(() => ({ subject: 'Expired', html: '<p>expired</p>' })),
}));

const mockCreateNotification = vi.fn().mockResolvedValue(null);
vi.mock('./notifications.ts', () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
}));

vi.mock('./logger.ts', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  sanitizeError: (e: unknown) => e,
}));

import { processProPeriods } from './pro-period-scheduler.ts';

describe('pro-period-scheduler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('expires overdue periods and sends expiration email', async () => {
    // Query 1: find overdue periods
    mockSqlFn.mockResolvedValueOnce([
      { id: 1, user_id: 42, source: 'trial', email: 'sitter@test.com', name: 'Jane', founding_sitter: false },
    ]);
    mockExpireProPeriod.mockResolvedValueOnce(undefined);
    // Queries 2-4: warning queries (empty)
    mockSqlFn.mockResolvedValueOnce([]);
    mockSqlFn.mockResolvedValueOnce([]);
    mockSqlFn.mockResolvedValueOnce([]);

    const result = await processProPeriods();
    expect(result.expired).toBe(1);
    expect(mockExpireProPeriod).toHaveBeenCalledWith(1, expect.anything());
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
  });

  it('transitions founding sitters from beta to 6-month free Pro', async () => {
    // Query 1: find overdue beta period for founding sitter
    mockSqlFn.mockResolvedValueOnce([
      { id: 2, user_id: 10, source: 'beta', email: 'founding@test.com', name: 'Bob', founding_sitter: true },
    ]);
    mockExpireProPeriod.mockResolvedValueOnce(undefined);
    mockCreateProPeriod.mockResolvedValueOnce({ id: 3 });
    // Queries 2-4: warning queries (empty)
    mockSqlFn.mockResolvedValueOnce([]);
    mockSqlFn.mockResolvedValueOnce([]);
    mockSqlFn.mockResolvedValueOnce([]);

    const result = await processProPeriods();
    expect(result.expired).toBe(1);
    expect(result.transitioned).toBe(1);
    // Should NOT send expiration email (founding sitter gets upgraded)
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockCreateProPeriod).toHaveBeenCalledWith(
      10, 'beta_transition', expect.any(Date), expect.anything()
    );
  });

  it('sends 14-day warning for beta periods', async () => {
    const endsIn12Days = new Date();
    endsIn12Days.setDate(endsIn12Days.getDate() + 12);

    // Query 1: no overdue periods
    mockSqlFn.mockResolvedValueOnce([]);
    // Query 2: 14d warnings
    mockSqlFn.mockResolvedValueOnce([
      { id: 5, user_id: 20, source: 'beta', ends_at: endsIn12Days.toISOString(), email: 'beta@test.com', name: 'Charlie', founding_sitter: true },
    ]);
    // Update warning_14d_sent_at
    mockSqlFn.mockResolvedValueOnce([]);
    // Queries 3-4: 7d and 1d warnings (empty)
    mockSqlFn.mockResolvedValueOnce([]);
    mockSqlFn.mockResolvedValueOnce([]);

    const result = await processProPeriods();
    expect(result.warned14d).toBe(1);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
  });

  it('sends 7-day warning for trial periods', async () => {
    const endsIn5Days = new Date();
    endsIn5Days.setDate(endsIn5Days.getDate() + 5);

    // Query 1: no overdue
    mockSqlFn.mockResolvedValueOnce([]);
    // Query 2: no 14d warnings
    mockSqlFn.mockResolvedValueOnce([]);
    // Query 3: 7d warnings
    mockSqlFn.mockResolvedValueOnce([
      { id: 7, user_id: 30, source: 'trial', ends_at: endsIn5Days.toISOString(), email: 'trial@test.com', name: 'Dana' },
    ]);
    // Update warning_7d_sent_at
    mockSqlFn.mockResolvedValueOnce([]);
    // Query 4: no 1d warnings
    mockSqlFn.mockResolvedValueOnce([]);

    const result = await processProPeriods();
    expect(result.warned7d).toBe(1);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it('sends 1-day warning', async () => {
    const endsInHours = new Date();
    endsInHours.setHours(endsInHours.getHours() + 12);

    // Queries 1-3: empty
    mockSqlFn.mockResolvedValueOnce([]);
    mockSqlFn.mockResolvedValueOnce([]);
    mockSqlFn.mockResolvedValueOnce([]);
    // Query 4: 1d warnings
    mockSqlFn.mockResolvedValueOnce([
      { id: 9, user_id: 40, source: 'trial', ends_at: endsInHours.toISOString(), email: 'last@test.com', name: 'Eve' },
    ]);
    // Update warning_1d_sent_at
    mockSqlFn.mockResolvedValueOnce([]);

    const result = await processProPeriods();
    expect(result.warned1d).toBe(1);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it('handles no periods gracefully', async () => {
    mockSqlFn.mockResolvedValueOnce([]);
    mockSqlFn.mockResolvedValueOnce([]);
    mockSqlFn.mockResolvedValueOnce([]);
    mockSqlFn.mockResolvedValueOnce([]);

    const result = await processProPeriods();
    expect(result).toEqual({ expired: 0, warned14d: 0, warned7d: 0, warned1d: 0, transitioned: 0 });
  });

  it('continues processing other periods when one fails', async () => {
    // Two overdue periods, first one fails
    mockSqlFn.mockResolvedValueOnce([
      { id: 1, user_id: 42, source: 'trial', email: 'fail@test.com', name: 'Fail', founding_sitter: false },
      { id: 2, user_id: 43, source: 'trial', email: 'ok@test.com', name: 'OK', founding_sitter: false },
    ]);
    mockExpireProPeriod
      .mockRejectedValueOnce(new Error('db error'))
      .mockResolvedValueOnce(undefined);
    // Queries 2-4: empty
    mockSqlFn.mockResolvedValueOnce([]);
    mockSqlFn.mockResolvedValueOnce([]);
    mockSqlFn.mockResolvedValueOnce([]);

    const result = await processProPeriods();
    // First failed but second succeeded
    expect(result.expired).toBe(1);
  });
});
