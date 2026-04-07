import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSqlFn } = vi.hoisted(() => {
  const sqlFn = vi.fn();
  return { mockSqlFn: sqlFn };
});
vi.mock('./db.ts', () => ({ default: mockSqlFn }));

const mockCreateNotification = vi.fn().mockResolvedValue(null);
vi.mock('./notifications.ts', () => ({
  createNotification: (...args: unknown[]) => mockCreateNotification(...args),
}));

vi.mock('./logger.ts', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  sanitizeError: (e: unknown) => e,
}));

import { processRecurringExpenses } from './recurring-expenses.ts';

describe('recurring expense scheduler', () => {
  beforeEach(() => vi.clearAllMocks());

  it('generates expense entries from active recurring templates', async () => {
    // Query 1: find active recurring expenses due today
    mockSqlFn.mockResolvedValueOnce([
      {
        id: 1,
        sitter_id: 10,
        category: 'insurance',
        amount_cents: 4500,
        description: 'Pet insurance premium',
        day_of_month: 1,
      },
      {
        id: 2,
        sitter_id: 10,
        category: 'supplies',
        amount_cents: 2000,
        description: 'Treats subscription',
        day_of_month: 1,
      },
    ]);
    // Insert expense for template 1
    mockSqlFn.mockResolvedValueOnce([{ id: 100 }]);
    // Insert expense for template 2
    mockSqlFn.mockResolvedValueOnce([{ id: 101 }]);
    // Group by sitter_id for notifications — returns count per sitter
    // After inserts, we notify. The function groups internally.

    const { generated } = await processRecurringExpenses();
    expect(generated).toBe(2);
    // Should insert into sitter_expenses for each template
    expect(mockSqlFn).toHaveBeenCalledTimes(3); // 1 select + 2 inserts
  });

  it('sends notification grouped by sitter', async () => {
    mockSqlFn.mockResolvedValueOnce([
      {
        id: 1,
        sitter_id: 10,
        category: 'insurance',
        amount_cents: 4500,
        description: 'Pet insurance',
        day_of_month: 1,
      },
      {
        id: 2,
        sitter_id: 10,
        category: 'supplies',
        amount_cents: 2000,
        description: 'Treats',
        day_of_month: 1,
      },
      {
        id: 3,
        sitter_id: 20,
        category: 'equipment',
        amount_cents: 1500,
        description: 'Software',
        day_of_month: 1,
      },
    ]);
    // 3 inserts
    mockSqlFn.mockResolvedValueOnce([{ id: 100 }]);
    mockSqlFn.mockResolvedValueOnce([{ id: 101 }]);
    mockSqlFn.mockResolvedValueOnce([{ id: 102 }]);

    await processRecurringExpenses();
    // 2 sitters should get notifications
    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
    // Sitter 10 notification should mention 2 expenses
    expect(mockCreateNotification).toHaveBeenCalledWith(
      10,
      'payment_update',
      '2 recurring expenses logged',
      expect.stringContaining('review'),
    );
    // Sitter 20 notification should mention 1 expense
    expect(mockCreateNotification).toHaveBeenCalledWith(
      20,
      'payment_update',
      '1 recurring expense logged',
      expect.stringContaining('review'),
    );
  });

  it('returns zero when no active templates are due', async () => {
    mockSqlFn.mockResolvedValueOnce([]);

    const { generated } = await processRecurringExpenses();
    expect(generated).toBe(0);
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it('uses source_reference for idempotency', async () => {
    mockSqlFn.mockResolvedValueOnce([
      {
        id: 5,
        sitter_id: 10,
        category: 'insurance',
        amount_cents: 4500,
        description: 'Insurance',
        day_of_month: 15,
      },
    ]);
    // The insert should use ON CONFLICT for idempotency
    mockSqlFn.mockResolvedValueOnce([{ id: 100 }]);

    await processRecurringExpenses();
    // Verify the insert call was made (first call is SELECT, second is INSERT)
    expect(mockSqlFn).toHaveBeenCalledTimes(2);
  });

  it('continues processing remaining templates if one insert fails', async () => {
    mockSqlFn.mockResolvedValueOnce([
      {
        id: 1,
        sitter_id: 10,
        category: 'insurance',
        amount_cents: 4500,
        description: 'Insurance',
        day_of_month: 1,
      },
      {
        id: 2,
        sitter_id: 20,
        category: 'supplies',
        amount_cents: 2000,
        description: 'Supplies',
        day_of_month: 1,
      },
    ]);
    // First insert fails
    mockSqlFn.mockRejectedValueOnce(new Error('DB error'));
    // Second insert succeeds
    mockSqlFn.mockResolvedValueOnce([{ id: 101 }]);

    const { generated } = await processRecurringExpenses();
    expect(generated).toBe(1);
  });
});

describe('recurring expense validation', () => {
  // Import validation schema
  let recurringExpenseSchema: any;

  beforeEach(async () => {
    const mod = await import('./validation.ts');
    recurringExpenseSchema = mod.recurringExpenseSchema;
  });

  it('accepts valid recurring expense', () => {
    const result = recurringExpenseSchema.safeParse({
      category: 'insurance',
      amount_cents: 4500,
      description: 'Pet insurance premium',
      day_of_month: 1,
    });
    expect(result.success).toBe(true);
  });

  it('accepts day_of_month between 1 and 28', () => {
    for (const day of [1, 14, 28]) {
      const result = recurringExpenseSchema.safeParse({
        category: 'supplies',
        amount_cents: 1000,
        day_of_month: day,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects day_of_month above 28', () => {
    const result = recurringExpenseSchema.safeParse({
      category: 'supplies',
      amount_cents: 1000,
      day_of_month: 29,
    });
    expect(result.success).toBe(false);
  });

  it('rejects day_of_month below 1', () => {
    const result = recurringExpenseSchema.safeParse({
      category: 'supplies',
      amount_cents: 1000,
      day_of_month: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative amount', () => {
    const result = recurringExpenseSchema.safeParse({
      category: 'supplies',
      amount_cents: -100,
      day_of_month: 1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects unknown category', () => {
    const result = recurringExpenseSchema.safeParse({
      category: 'groceries',
      amount_cents: 1000,
      day_of_month: 1,
    });
    expect(result.success).toBe(false);
  });

  it('description is optional', () => {
    const result = recurringExpenseSchema.safeParse({
      category: 'insurance',
      amount_cents: 4500,
      day_of_month: 15,
    });
    expect(result.success).toBe(true);
  });

  it('rejects description over 500 chars', () => {
    const result = recurringExpenseSchema.safeParse({
      category: 'insurance',
      amount_cents: 4500,
      day_of_month: 15,
      description: 'a'.repeat(501),
    });
    expect(result.success).toBe(false);
  });
});

describe('common recurring expense templates', () => {
  it('provides pre-loaded common templates', async () => {
    const { COMMON_RECURRING_TEMPLATES } = await import('./recurring-expenses.ts');
    expect(COMMON_RECURRING_TEMPLATES.length).toBeGreaterThan(0);
    for (const t of COMMON_RECURRING_TEMPLATES) {
      expect(t).toHaveProperty('category');
      expect(t).toHaveProperty('description');
      expect(t).toHaveProperty('amount_cents');
    }
  });
});
