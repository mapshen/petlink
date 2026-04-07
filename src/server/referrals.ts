import crypto from 'crypto';
import sql from './db.ts';
import { issueCredit } from './credits.ts';
import { dollarsToCents } from '../lib/money.ts';
import logger, { sanitizeError } from './logger.ts';

export const REFERRER_CREDIT_CENTS = dollarsToCents(10);
export const REFERRED_CREDIT_CENTS = dollarsToCents(5);
export const MAX_REFERRALS_PER_MONTH = 20;
export const REFERRAL_EXPIRY_DAYS = 90;

const ALPHANUMERIC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion

/** Generate an 8-character alphanumeric referral code. */
export function generateReferralCode(): string {
  const bytes = crypto.randomBytes(8);
  return Array.from(bytes, (b) => ALPHANUMERIC[b % ALPHANUMERIC.length]).join('');
}

/** Get or create a referral code for a user. */
export async function getOrCreateReferralCode(userId: number): Promise<string> {
  const [user] = await sql`SELECT referral_code FROM users WHERE id = ${userId}`;
  if (user?.referral_code) return user.referral_code;

  const code = generateReferralCode();
  const [updated] = await sql`
    UPDATE users SET referral_code = ${code}
    WHERE id = ${userId} AND referral_code IS NULL
    RETURNING referral_code
  `;

  // Race condition: another request may have set the code first
  if (!updated) {
    const [existing] = await sql`SELECT referral_code FROM users WHERE id = ${userId}`;
    return existing.referral_code;
  }

  return updated.referral_code;
}

interface ApplyResult {
  readonly success: boolean;
  readonly error?: string;
  readonly referral?: Record<string, unknown>;
}

/** Apply a referral code for a new user. Creates a pending referral. */
export async function applyReferralCode(
  referredUserId: number,
  code: string
): Promise<ApplyResult> {
  // Find referrer by code
  const [referrer] = await sql`
    SELECT id, referral_code FROM users
    WHERE referral_code = ${code.toUpperCase()}
  `;

  if (!referrer) {
    return { success: false, error: 'Invalid referral code' };
  }

  // Self-referral check
  if (referrer.id === referredUserId) {
    return { success: false, error: 'You cannot use your own referral code' };
  }

  // Already referred check
  const [existing] = await sql`
    SELECT id FROM referrals WHERE referred_id = ${referredUserId}
  `;
  if (existing) {
    return { success: false, error: 'You have already used a referral code' };
  }

  // Monthly limit check
  const [{ count }] = await sql`
    SELECT count(*)::int AS count FROM referrals
    WHERE referrer_id = ${referrer.id}
      AND created_at > NOW() - INTERVAL '30 days'
  `;
  if (count >= MAX_REFERRALS_PER_MONTH) {
    return { success: false, error: 'This referral code has reached its monthly limit' };
  }

  const expiresAt = new Date(Date.now() + REFERRAL_EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const [referral] = await sql`
    INSERT INTO referrals (referrer_id, referred_id, referral_code, status, expires_at)
    VALUES (${referrer.id}, ${referredUserId}, ${code.toUpperCase()}, 'pending', ${expiresAt})
    RETURNING *
  `;

  logger.info({ referrerId: referrer.id, referredId: referredUserId, code }, 'Referral code applied');
  return { success: true, referral };
}

interface CompleteResult {
  readonly completed: boolean;
  readonly referrerId?: number;
  readonly referredId?: number;
}

/**
 * Complete a referral when the referred user finishes their first booking.
 * Issues credits to both referrer and referred user.
 * Should be called when a booking transitions to 'completed'.
 */
export async function completeReferral(referredUserId: number): Promise<CompleteResult> {
  // Find pending, non-expired referral for this user
  const [referral] = await sql`
    SELECT id, referrer_id, referred_id, referral_code FROM referrals
    WHERE referred_id = ${referredUserId}
      AND status = 'pending'
      AND expires_at > NOW()
  `;

  if (!referral) return { completed: false };

  // Check this is actually the first completed booking
  const [{ count }] = await sql`
    SELECT count(*)::int AS count FROM bookings
    WHERE owner_id = ${referredUserId} AND status = 'completed'
  `;
  if (count !== 1) return { completed: false };

  const creditExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await sql.begin(async (tx: any) => {
      // Mark referral as completed
      await tx`
        UPDATE referrals SET status = 'completed', completed_at = NOW(), credited_at = NOW()
        WHERE id = ${referral.id} AND status = 'pending'
        RETURNING id
      `;

      // Issue credit to referrer ($10)
      await issueCredit(
        referral.referrer_id,
        REFERRER_CREDIT_CENTS,
        'referral',
        'referral_invite',
        'You referred a friend — thanks for spreading the word!',
        referral.id,
        creditExpiry,
        tx
      );

      // Issue credit to referred user ($5)
      await issueCredit(
        referral.referred_id,
        REFERRED_CREDIT_CENTS,
        'referral',
        'referral_invite',
        'Welcome bonus for joining through a friend!',
        referral.id,
        creditExpiry,
        tx
      );
    });

    logger.info(
      { referrerId: referral.referrer_id, referredId: referral.referred_id, referralId: referral.id },
      'Referral completed — credits issued to both parties'
    );

    return { completed: true, referrerId: referral.referrer_id, referredId: referral.referred_id };
  } catch (err) {
    logger.error({ err: sanitizeError(err), referralId: referral.id }, 'Failed to complete referral');
    return { completed: false };
  }
}

export interface ReferralStats {
  readonly referral_code: string;
  readonly total_referrals: number;
  readonly pending_referrals: number;
  readonly completed_referrals: number;
  readonly total_earned_cents: number;
}

/** Get referral dashboard stats for a user. */
export async function getReferralStats(userId: number): Promise<ReferralStats> {
  const [user] = await sql`SELECT referral_code FROM users WHERE id = ${userId}`;

  const [counts] = await sql`
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE status = 'pending')::int AS pending,
      count(*) FILTER (WHERE status = 'completed')::int AS completed
    FROM referrals
    WHERE referrer_id = ${userId}
  `;

  const [earnings] = await sql`
    SELECT COALESCE(SUM(amount_cents), 0)::int AS total_earned_cents
    FROM credit_ledger
    WHERE user_id = ${userId}
      AND type = 'referral'
      AND source_type = 'referral_invite'
      AND amount_cents > 0
  `;

  return {
    referral_code: user.referral_code ?? '',
    total_referrals: counts.total,
    pending_referrals: counts.pending,
    completed_referrals: counts.completed,
    total_earned_cents: earnings.total_earned_cents,
  };
}
