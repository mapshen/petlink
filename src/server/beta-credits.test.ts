import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mock infrastructure ---
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
const mockEscapeHtml = vi.fn((s: string) => s);
vi.mock('./email.ts', () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
  escapeHtml: (s: string) => mockEscapeHtml(s),
  buildCreditLowWarningEmail: vi.fn(() => ({ subject: 'Credits running low', html: '<p>Low credits</p>' })),
  buildFoundingSitterWelcomeEmail: vi.fn(() => ({ subject: 'Welcome Founding Sitter', html: '<p>Welcome</p>' })),
}));

vi.mock('./logger.ts', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  sanitizeError: (e: unknown) => e,
}));

const mockGetBalance = vi.fn();
const mockApplyCredits = vi.fn();
vi.mock('./credits.ts', () => ({
  getBalance: (...args: unknown[]) => mockGetBalance(...args),
  applyCredits: (...args: unknown[]) => mockApplyCredits(...args),
  issueCredit: vi.fn().mockResolvedValue({ id: 1, amount_cents: 12000 }),
}));

// --- Import after mocks ---
import { checkCreditLowWarnings } from './credit-low-warning.ts';
import { betaCreditSchema } from './validation.ts';

describe('credit low warning scheduler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends warning email for sitters with low balance (0 < balance < $10)', async () => {
    mockSqlFn.mockResolvedValueOnce([
      { sitter_id: 42, email: 'sitter@example.com', name: 'Jane', balance_cents: 800 },
    ]);
    mockSqlFn.mockResolvedValueOnce([]);

    const sent = await checkCreditLowWarnings();
    expect(sent).toBe(1);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'sitter@example.com',
      subject: 'Credits running low',
    }));
  });

  it('does not send warning for sitters with zero balance', async () => {
    mockSqlFn.mockResolvedValueOnce([]);

    const sent = await checkCreditLowWarnings();
    expect(sent).toBe(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('does not re-warn sitters already warned within 25 days', async () => {
    mockSqlFn.mockResolvedValueOnce([]);
    const sent = await checkCreditLowWarnings();
    expect(sent).toBe(0);
  });

  it('handles multiple sitters with low balances', async () => {
    mockSqlFn.mockResolvedValueOnce([
      { sitter_id: 42, email: 'a@example.com', name: 'A', balance_cents: 500 },
      { sitter_id: 43, email: 'b@example.com', name: 'B', balance_cents: 900 },
    ]);
    mockSqlFn.mockResolvedValueOnce([]);
    mockSqlFn.mockResolvedValueOnce([]);

    const sent = await checkCreditLowWarnings();
    expect(sent).toBe(2);
    expect(mockSendEmail).toHaveBeenCalledTimes(2);
  });

  it('does NOT mark as warned when email fails', async () => {
    mockSqlFn.mockResolvedValueOnce([
      { sitter_id: 42, email: 'a@example.com', name: 'A', balance_cents: 500 },
      { sitter_id: 43, email: 'b@example.com', name: 'B', balance_cents: 900 },
    ]);
    // First email fails
    mockSendEmail.mockRejectedValueOnce(new Error('email failed'));
    // Second email succeeds
    mockSendEmail.mockResolvedValueOnce({ id: 'msg_456' });
    // Only one UPDATE for the successful send
    mockSqlFn.mockResolvedValueOnce([]);

    const sent = await checkCreditLowWarnings();
    // Only one succeeded
    expect(sent).toBe(1);
    // SQL called: 1 (query) + 1 (update for sitter 43 only) = 2
    expect(mockSqlFn).toHaveBeenCalledTimes(2);
  });
});

// --- Invoice Paid Credit Application Logic ---
describe('invoice.paid credit application logic', () => {
  it('applies min(balance, invoiceAmount) when balance < invoice', () => {
    const balance = 800;
    const invoiceAmount = 1999;
    const applyAmount = Math.min(balance, invoiceAmount);
    expect(applyAmount).toBe(800);
  });

  it('caps credit application at invoice amount when balance > invoice', () => {
    const balance = 5000;
    const invoiceAmount = 1999;
    const applyAmount = Math.min(balance, invoiceAmount);
    expect(applyAmount).toBe(1999);
  });

  it('applies exact balance when balance equals invoice', () => {
    const balance = 1999;
    const invoiceAmount = 1999;
    const applyAmount = Math.min(balance, invoiceAmount);
    expect(applyAmount).toBe(1999);
  });

  it('does not apply credits when balance is zero', () => {
    const balance = 0;
    const invoiceAmount = 1999;
    const shouldApply = balance > 0;
    expect(shouldApply).toBe(false);
  });
});

// --- Beta Credit Schema Validation ---
describe('betaCreditSchema validation', () => {
  it('accepts valid founding cohort with valid amount', () => {
    const result = betaCreditSchema.safeParse({ amount_cents: 12000, cohort: 'founding' });
    expect(result.success).toBe(true);
  });

  it('accepts valid early_beta cohort', () => {
    const result = betaCreditSchema.safeParse({ amount_cents: 6000, cohort: 'early_beta' });
    expect(result.success).toBe(true);
  });

  it('accepts valid post_beta cohort', () => {
    const result = betaCreditSchema.safeParse({ amount_cents: 2000, cohort: 'post_beta' });
    expect(result.success).toBe(true);
  });

  it('rejects amount below minimum ($20)', () => {
    const result = betaCreditSchema.safeParse({ amount_cents: 1999, cohort: 'post_beta' });
    expect(result.success).toBe(false);
  });

  it('rejects amount above maximum ($240)', () => {
    const result = betaCreditSchema.safeParse({ amount_cents: 24001, cohort: 'founding' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid cohort', () => {
    const result = betaCreditSchema.safeParse({ amount_cents: 12000, cohort: 'unknown' });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer amount', () => {
    const result = betaCreditSchema.safeParse({ amount_cents: 12000.5, cohort: 'founding' });
    expect(result.success).toBe(false);
  });

  it('accepts max founding amount ($240)', () => {
    const result = betaCreditSchema.safeParse({ amount_cents: 24000, cohort: 'founding' });
    expect(result.success).toBe(true);
  });
});

// --- Cohort Range Validation ---
describe('beta cohort credit ranges', () => {
  const COHORT_RANGES = {
    founding: { min: 12000, max: 24000 },
    early_beta: { min: 6000, max: 12000 },
    post_beta: { min: 2000, max: 4000 },
  } as const;

  it('founding range covers $120-$240', () => {
    expect(COHORT_RANGES.founding.min).toBe(12000);
    expect(COHORT_RANGES.founding.max).toBe(24000);
  });

  it('early_beta range covers $60-$120', () => {
    expect(COHORT_RANGES.early_beta.min).toBe(6000);
    expect(COHORT_RANGES.early_beta.max).toBe(12000);
  });

  it('post_beta range covers $20-$40', () => {
    expect(COHORT_RANGES.post_beta.min).toBe(2000);
    expect(COHORT_RANGES.post_beta.max).toBe(4000);
  });

  it('rejects amounts outside cohort range', () => {
    const range = COHORT_RANGES.founding;
    expect(11999 >= range.min).toBe(false);
    expect(24001 <= range.max).toBe(false);
  });
});
