import sql from './db.ts';
import logger, { sanitizeError } from './logger.ts';

export const BACKGROUND_CHECK_FEE_CENTS = 3500; // $35.00 — standard Checkr tasker package

interface AutoExpenseInput {
  sitter_id: number;
  category: string;
  amount_cents: number;
  description: string;
  date: string;
  source_reference: string;
}

interface AutoExpenseResult {
  inserted: boolean;
  expense?: Record<string, unknown>;
}

/**
 * Insert an auto-logged expense with idempotency via source_reference unique index.
 * Non-throwing by design — callers should not have their primary flow interrupted.
 */
export async function insertAutoExpense(input: AutoExpenseInput): Promise<AutoExpenseResult> {
  try {
    const [expense] = await sql`
      INSERT INTO sitter_expenses (sitter_id, category, amount_cents, description, date, auto_logged, source_reference)
      VALUES (${input.sitter_id}, ${input.category}, ${input.amount_cents},
              ${input.description}, ${input.date}, true, ${input.source_reference})
      ON CONFLICT (source_reference) WHERE source_reference IS NOT NULL DO NOTHING
      RETURNING *
    `;
    if (expense) {
      logger.info({ sitterId: input.sitter_id, category: input.category, sourceRef: input.source_reference }, 'Auto-expense logged');
      return { inserted: true, expense };
    }
    logger.info({ sourceRef: input.source_reference }, 'Auto-expense already exists (idempotent skip)');
    return { inserted: false };
  } catch (err) {
    logger.warn({ err: sanitizeError(err), sitterId: input.sitter_id, sourceRef: input.source_reference }, 'Failed to insert auto-expense');
    return { inserted: false };
  }
}
