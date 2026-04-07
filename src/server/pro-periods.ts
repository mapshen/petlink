import sql from './db.ts';
import logger from './logger.ts';
import type { ProPeriodSource, ProPeriodStatus } from '../types.ts';

export type { ProPeriodSource, ProPeriodStatus };

export interface ProPeriod {
  id: number;
  user_id: number;
  source: ProPeriodSource;
  starts_at: string;
  ends_at: string;
  status: ProPeriodStatus;
  warning_14d_sent_at: string | null;
  warning_7d_sent_at: string | null;
  warning_1d_sent_at: string | null;
  created_at: string;
}

/**
 * Create a new pro period for a user. Sets their subscription_tier to 'pro'.
 * Optionally accepts a transaction handle for atomic operations.
 *
 * Design: users.subscription_tier is the source of truth for fee calculation
 * (calculateApplicationFee in stripe-connect.ts reads it directly).
 * This function and expireProPeriod keep it in sync with pro_periods state.
 * The scheduler also reconciles on expiration to prevent drift.
 */
export async function createProPeriod(
  userId: number,
  source: ProPeriodSource,
  endsAt: Date,
  tx?: any
): Promise<ProPeriod> {
  const db = tx ?? sql;

  const [period] = await db`
    INSERT INTO pro_periods (user_id, source, starts_at, ends_at, status)
    VALUES (${userId}, ${source}, NOW(), ${endsAt.toISOString()}, 'active')
    RETURNING *
  `;

  // Set subscription tier to pro (only if not already on a paid subscription)
  await db`
    UPDATE users SET subscription_tier = 'pro'
    WHERE id = ${userId}
      AND NOT EXISTS (
        SELECT 1 FROM sitter_subscriptions
        WHERE sitter_id = ${userId} AND status = 'active' AND tier IN ('pro', 'premium')
      )
  `;

  logger.info({ userId, source, endsAt: endsAt.toISOString() }, 'Pro period created');
  return period as ProPeriod;
}

/** Get the active pro period for a user (if any). */
export async function getActiveProPeriod(userId: number): Promise<ProPeriod | null> {
  const [period] = await sql`
    SELECT * FROM pro_periods
    WHERE user_id = ${userId} AND status = 'active' AND ends_at > NOW()
    ORDER BY created_at DESC LIMIT 1
  `;
  return (period as ProPeriod) ?? null;
}

/** Check if a user has any active pro period. */
export async function hasActiveProPeriod(userId: number): Promise<boolean> {
  const period = await getActiveProPeriod(userId);
  return period !== null;
}

/** Expire a pro period and downgrade user to free (if no paid subscription). */
export async function expireProPeriod(periodId: number, tx?: typeof sql): Promise<void> {
  const db = tx ?? sql;

  const [period] = await db`
    UPDATE pro_periods SET status = 'expired'
    WHERE id = ${periodId} AND status = 'active'
    RETURNING user_id
  `;

  if (!period) return;

  // Check if user has another active pro period or paid subscription
  const [otherPeriod] = await db`
    SELECT 1 FROM pro_periods
    WHERE user_id = ${period.user_id} AND status = 'active' AND ends_at > NOW() AND id != ${periodId}
    LIMIT 1
  `;
  if (otherPeriod) return;

  const [paidSub] = await db`
    SELECT 1 FROM sitter_subscriptions
    WHERE sitter_id = ${period.user_id} AND status = 'active' AND tier IN ('pro', 'premium')
    LIMIT 1
  `;

  if (!paidSub) {
    await db`UPDATE users SET subscription_tier = 'free' WHERE id = ${period.user_id}`;
    logger.info({ userId: period.user_id, periodId }, 'User downgraded to free tier after pro period expiration');
  }
}

/** Cancel a pro period (admin action). */
export async function cancelProPeriod(periodId: number): Promise<void> {
  await sql.begin(async (tx: any) => {
    const [period] = await tx`
      UPDATE pro_periods SET status = 'cancelled'
      WHERE id = ${periodId} AND status = 'active'
      RETURNING user_id
    `;
    if (!period) return;

    // Check if user has other active periods or paid subscription
    const [otherPeriod] = await tx`
      SELECT 1 FROM pro_periods
      WHERE user_id = ${period.user_id} AND status = 'active' AND ends_at > NOW()
      LIMIT 1
    `;
    const [paidSub] = await tx`
      SELECT 1 FROM sitter_subscriptions
      WHERE sitter_id = ${period.user_id} AND status = 'active' AND tier IN ('pro', 'premium')
      LIMIT 1
    `;

    if (!otherPeriod && !paidSub) {
      await tx`UPDATE users SET subscription_tier = 'free' WHERE id = ${period.user_id}`;
    }
  });
}

/** Check if a user has already used their free trial. */
export async function hasUsedTrial(userId: number): Promise<boolean> {
  const [row] = await sql`
    SELECT pro_trial_used FROM users WHERE id = ${userId}
  `;
  return row?.pro_trial_used === true;
}

/** Mark a user as having used their free trial. */
export async function markTrialUsed(userId: number, tx?: typeof sql): Promise<void> {
  const db = tx ?? sql;
  await db`UPDATE users SET pro_trial_used = true WHERE id = ${userId}`;
}

/**
 * Get pro period with computed days remaining for API responses.
 */
export async function getProPeriodWithDaysRemaining(userId: number): Promise<(ProPeriod & { days_remaining: number }) | null> {
  const period = await getActiveProPeriod(userId);
  if (!period) return null;

  const now = Date.now();
  const endsAt = new Date(period.ends_at).getTime();
  const daysRemaining = Math.max(0, Math.ceil((endsAt - now) / (24 * 60 * 60 * 1000)));

  return { ...period, days_remaining: daysRemaining };
}
