import sql from './db.ts';
import type { CreditType, CreditSourceType, CreditEntry } from '../types.ts';

/**
 * Get a user's current credit balance (sum of non-expired entries).
 */
export async function getBalance(userId: number): Promise<number> {
  const [row] = await sql`
    SELECT COALESCE(SUM(amount_cents), 0)::int AS balance
    FROM credit_ledger
    WHERE user_id = ${userId}
      AND (expires_at IS NULL OR expires_at > NOW())
  `;
  return row.balance;
}

/**
 * Get paginated credit history for a user.
 */
export async function getCreditHistory(
  userId: number,
  limit = 50,
  offset = 0
): Promise<CreditEntry[]> {
  const entries = await sql`
    SELECT id, user_id, amount_cents, type, source_type, source_id, description, expires_at, created_at
    FROM credit_ledger
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  return entries as unknown as CreditEntry[];
}

/**
 * Issue credits to a user (positive amount).
 * Accepts optional transaction handle for use within existing transactions.
 */
export async function issueCredit(
  userId: number,
  amountCents: number,
  type: CreditType,
  sourceType: CreditSourceType,
  description: string,
  sourceId?: number | null,
  expiresAt?: string | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx?: any
): Promise<CreditEntry> {
  if (amountCents <= 0) {
    throw new Error('Credit amount must be positive');
  }

  const query = tx ?? sql;
  const [entry] = await query`
    INSERT INTO credit_ledger (user_id, amount_cents, type, source_type, source_id, description, expires_at)
    VALUES (${userId}, ${amountCents}, ${type}, ${sourceType}, ${sourceId ?? null}, ${description}, ${expiresAt ?? null})
    RETURNING *
  `;
  return entry as unknown as CreditEntry;
}

/**
 * Apply (deduct) credits from a user's balance.
 * Uses FOR UPDATE lock to prevent double-spend race condition.
 * Throws if insufficient balance.
 * Accepts optional transaction handle — if provided, caller owns the transaction.
 */
export async function applyCredits(
  userId: number,
  amountCents: number,
  description: string,
  sourceType: CreditSourceType,
  sourceId?: number | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  txHandle?: any
): Promise<CreditEntry> {
  if (amountCents <= 0) {
    throw new Error('Redemption amount must be positive');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const doApply = async (tx: any): Promise<CreditEntry> => {
    const [{ balance }] = await tx`
      SELECT COALESCE(SUM(amount_cents), 0)::int AS balance
      FROM credit_ledger
      WHERE user_id = ${userId}
        AND (expires_at IS NULL OR expires_at > NOW())
      FOR UPDATE
    `;

    if (balance < amountCents) {
      throw new Error('Insufficient credit balance');
    }

    const [entry] = await tx`
      INSERT INTO credit_ledger (user_id, amount_cents, type, source_type, source_id, description)
      VALUES (${userId}, ${-amountCents}, 'redemption', ${sourceType}, ${sourceId ?? null}, ${description})
      RETURNING *
    `;
    return entry as unknown as CreditEntry;
  };

  if (txHandle) {
    return doApply(txHandle);
  }

  return sql.begin(doApply);
}
