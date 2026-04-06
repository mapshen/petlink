import sql from './db.ts';

export type CreditType = 'referral' | 'dispute_resolution' | 'promo' | 'beta_reward' | 'milestone' | 'redemption' | 'expiration';
export type CreditSourceType = 'dispute' | 'referral_invite' | 'admin_grant' | 'beta_program' | 'booking' | 'subscription' | 'system';

export interface CreditEntry {
  id: number;
  user_id: number;
  amount_cents: number;
  type: CreditType;
  source_type: CreditSourceType;
  source_id: number | null;
  description: string;
  expires_at: string | null;
  created_at: string;
}

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
 */
export async function issueCredit(
  userId: number,
  amountCents: number,
  type: CreditType,
  sourceType: CreditSourceType,
  description: string,
  sourceId?: number | null,
  expiresAt?: string | null
): Promise<CreditEntry> {
  if (amountCents <= 0) {
    throw new Error('Credit amount must be positive');
  }

  const [entry] = await sql`
    INSERT INTO credit_ledger (user_id, amount_cents, type, source_type, source_id, description, expires_at)
    VALUES (${userId}, ${amountCents}, ${type}, ${sourceType}, ${sourceId ?? null}, ${description}, ${expiresAt ?? null})
    RETURNING *
  `;
  return entry as unknown as CreditEntry;
}

/**
 * Apply (deduct) credits from a user's balance.
 * Returns the entry if successful. Throws if insufficient balance.
 */
export async function applyCredits(
  userId: number,
  amountCents: number,
  description: string,
  sourceType: CreditSourceType,
  sourceId?: number | null
): Promise<CreditEntry> {
  if (amountCents <= 0) {
    throw new Error('Redemption amount must be positive');
  }

  const balance = await getBalance(userId);
  if (balance < amountCents) {
    throw new Error('Insufficient credit balance');
  }

  const [entry] = await sql`
    INSERT INTO credit_ledger (user_id, amount_cents, type, source_type, source_id, description)
    VALUES (${userId}, ${-amountCents}, 'redemption', ${sourceType}, ${sourceId ?? null}, ${description})
    RETURNING *
  `;
  return entry as unknown as CreditEntry;
}
