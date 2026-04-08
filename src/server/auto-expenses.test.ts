import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database module
const mockSql = vi.fn();
vi.mock('./db.ts', () => ({ default: mockSql }));
vi.mock('./logger.ts', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  sanitizeError: (e: unknown) => e,
}));

describe('insertAutoExpense', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns inserted: true when expense is created', async () => {
    const fakeExpense = { id: 1, sitter_id: 10, category: 'platform_fee', amount_cents: 500 };
    mockSql.mockResolvedValueOnce([fakeExpense]);

    const { insertAutoExpense } = await import('./auto-expenses.ts');
    const result = await insertAutoExpense({
      sitter_id: 10,
      category: 'platform_fee',
      amount_cents: 500,
      description: 'Test fee',
      date: '2026-04-07',
      source_reference: 'platform_fee:booking:1',
    });

    expect(result.inserted).toBe(true);
    expect(result.expense).toEqual(fakeExpense);
  });

  it('returns inserted: false when source_reference already exists (idempotent)', async () => {
    // ON CONFLICT DO NOTHING returns empty array
    mockSql.mockResolvedValueOnce([]);

    const { insertAutoExpense } = await import('./auto-expenses.ts');
    const result = await insertAutoExpense({
      sitter_id: 10,
      category: 'platform_fee',
      amount_cents: 500,
      description: 'Test fee',
      date: '2026-04-07',
      source_reference: 'platform_fee:booking:1',
    });

    expect(result.inserted).toBe(false);
    expect(result.expense).toBeUndefined();
  });

  it('returns inserted: false on database error without throwing', async () => {
    mockSql.mockRejectedValueOnce(new Error('DB connection failed'));

    const { insertAutoExpense } = await import('./auto-expenses.ts');
    const result = await insertAutoExpense({
      sitter_id: 99,
      category: 'background_check',
      amount_cents: 3500,
      description: 'BG check',
      date: '2026-04-07',
      source_reference: 'bg_check:verification:1',
    });

    expect(result.inserted).toBe(false);
  });
});

describe('BACKGROUND_CHECK_FEE_CENTS', () => {
  it('is $35.00', async () => {
    const { BACKGROUND_CHECK_FEE_CENTS } = await import('./auto-expenses.ts');
    expect(BACKGROUND_CHECK_FEE_CENTS).toBe(3500);
  });
});
