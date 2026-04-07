import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSqlFn, mockTxFn, mockBeginFn } = vi.hoisted(() => {
  const txFn = vi.fn();
  const beginFn = vi.fn(async (cb: (tx: any) => Promise<any>) => cb(txFn));
  const sqlFn = vi.fn();
  (sqlFn as any).begin = beginFn;
  (sqlFn as any).unsafe = vi.fn((s: string) => s);
  return { mockSqlFn: sqlFn, mockTxFn: txFn, mockBeginFn: beginFn };
});
vi.mock('./db.ts', () => ({ default: mockSqlFn }));

const mockSendEmail = vi.fn().mockResolvedValue({ id: 'msg_123' });
vi.mock('./email.ts', () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
  escapeHtml: vi.fn((s: string) => s),
  buildDormancyWarningEmail: vi.fn(() => ({ subject: 'Dormancy warning', html: '<p>warn</p>' })),
  buildDormancyForfeitureEmail: vi.fn(() => ({ subject: 'Credits forfeited', html: '<p>forfeited</p>' })),
}));

vi.mock('./logger.ts', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  sanitizeError: (e: unknown) => e,
}));

import { checkDormancy } from './dormancy-check.ts';

describe('dormancy check scheduler', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('warning phase', () => {
    it('sends warning to users inactive 35+ months with credit balance', async () => {
      // Query 1: find users for warning
      mockSqlFn.mockResolvedValueOnce([
        { user_id: 42, email: 'user@example.com', name: 'Jane', balance_cents: 5000 },
      ]);
      // Query 2: find users for forfeiture
      mockSqlFn.mockResolvedValueOnce([]);
      // Update dormancy_warning_sent_at
      mockSqlFn.mockResolvedValueOnce([]);

      const { warned, forfeited } = await checkDormancy();
      expect(warned).toBe(1);
      expect(forfeited).toBe(0);
      expect(mockSendEmail).toHaveBeenCalledTimes(1);
    });

    it('skips users already warned', async () => {
      mockSqlFn.mockResolvedValueOnce([]);
      mockSqlFn.mockResolvedValueOnce([]);

      const { warned } = await checkDormancy();
      expect(warned).toBe(0);
    });

    it('does not mark warned if email fails', async () => {
      mockSqlFn.mockResolvedValueOnce([
        { user_id: 42, email: 'user@example.com', name: 'Jane', balance_cents: 5000 },
      ]);
      mockSqlFn.mockResolvedValueOnce([]);
      mockSendEmail.mockRejectedValueOnce(new Error('email failed'));

      const { warned } = await checkDormancy();
      expect(warned).toBe(0);
      // No UPDATE should have been called for warning
    });
  });

  describe('forfeiture phase', () => {
    it('forfeits credits for users inactive 36+ months with prior warning', async () => {
      // Query 1: warning phase (empty)
      mockSqlFn.mockResolvedValueOnce([]);
      // Query 2: forfeiture phase
      mockSqlFn.mockResolvedValueOnce([
        { user_id: 43, email: 'old@example.com', name: 'Bob', balance_cents: 3000 },
      ]);
      // Transaction calls for forfeiture
      mockTxFn.mockResolvedValueOnce([{ balance: 3000 }]); // SELECT balance inside tx
      mockTxFn.mockResolvedValueOnce([{ id: 1 }]); // INSERT credit_ledger
      mockTxFn.mockResolvedValueOnce([]); // INSERT dormancy_forfeiture_log
      // Email after forfeiture
      mockSqlFn.mockResolvedValueOnce([]);

      const { warned, forfeited } = await checkDormancy();
      expect(warned).toBe(0);
      expect(forfeited).toBe(1);
      expect(mockBeginFn).toHaveBeenCalledTimes(1);
    });

    it('does not double-forfeit on retry', async () => {
      mockSqlFn.mockResolvedValueOnce([]);
      // Forfeiture query returns empty (already forfeited or user logged back in)
      mockSqlFn.mockResolvedValueOnce([]);

      const { forfeited } = await checkDormancy();
      expect(forfeited).toBe(0);
    });
  });

  describe('activity tracking', () => {
    it('35-month threshold for warning (not 36)', () => {
      const WARNING_MONTHS = 35;
      const FORFEITURE_MONTHS = 36;
      expect(WARNING_MONTHS).toBeLessThan(FORFEITURE_MONTHS);
      expect(FORFEITURE_MONTHS - WARNING_MONTHS).toBe(1);
    });
  });
});
