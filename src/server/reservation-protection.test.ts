import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSqlFn, mockTxFn, mockBeginFn } = vi.hoisted(() => {
  const txFn = vi.fn();
  const beginFn = vi.fn(async (cb: (tx: any) => Promise<any>) => cb(txFn));
  const sqlFn = vi.fn();
  (sqlFn as any).begin = beginFn;
  return { mockSqlFn: sqlFn, mockTxFn: txFn, mockBeginFn: beginFn };
});
vi.mock('./db.ts', () => ({ default: mockSqlFn }));

vi.mock('./notifications.ts', () => ({
  createNotification: vi.fn().mockResolvedValue({ id: 1 }),
}));

vi.mock('./email.ts', () => ({
  sendEmail: vi.fn().mockResolvedValue(null),
  escapeHtml: vi.fn((s: string) => s),
  buildReservationProtectionEmail: vi.fn(() => ({ subject: 'Protection', html: '<p>test</p>' })),
}));

vi.mock('./logger.ts', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  sanitizeError: (e: unknown) => e,
}));

import { shouldTriggerProtection } from './reservation-protection.ts';

describe('reservation protection', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('shouldTriggerProtection', () => {
    it('triggers when sitter cancels confirmed booking within 48h of start', () => {
      const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h from now
      expect(shouldTriggerProtection('confirmed', startTime)).toBe(true);
    });

    it('triggers when sitter cancels confirmed booking within 1h of start', () => {
      const startTime = new Date(Date.now() + 60 * 60 * 1000); // 1h from now
      expect(shouldTriggerProtection('confirmed', startTime)).toBe(true);
    });

    it('does not trigger for pending bookings', () => {
      const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
      expect(shouldTriggerProtection('pending', startTime)).toBe(false);
    });

    it('does not trigger when cancellation is > 48h before start', () => {
      const startTime = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72h from now
      expect(shouldTriggerProtection('confirmed', startTime)).toBe(false);
    });

    it('does not trigger for past bookings', () => {
      const startTime = new Date(Date.now() - 60 * 60 * 1000); // 1h ago
      expect(shouldTriggerProtection('confirmed', startTime)).toBe(false);
    });

    it('triggers at exactly 48h boundary', () => {
      const startTime = new Date(Date.now() + 48 * 60 * 60 * 1000); // exactly 48h
      expect(shouldTriggerProtection('confirmed', startTime)).toBe(true);
    });
  });
});
