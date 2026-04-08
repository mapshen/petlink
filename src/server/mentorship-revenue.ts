import sql from './db.ts';
import type { MentorshipAgreement, MentorshipPayout, MentorshipAgreementStatus } from '../types.ts';
import logger, { sanitizeError } from './logger.ts';

export type { MentorshipAgreement, MentorshipPayout, MentorshipAgreementStatus };

// --- Constants ---
export const MAX_SHARE_PERCENTAGE = 15;
export const MIN_SHARE_PERCENTAGE = 1;
export const MAX_DURATION_MONTHS = 12;
export const MIN_DURATION_MONTHS = 1;
export const DEFAULT_MIN_EARNINGS_CENTS = 0; // Share kicks in immediately by default

/**
 * Create a revenue-sharing agreement proposal (mentor initiates, mentee must accept).
 */
export async function proposeAgreement(
  mentorshipId: number,
  mentorId: number,
  sharePercentage: number,
  durationMonths: number,
  minEarningsCents: number = DEFAULT_MIN_EARNINGS_CENTS
): Promise<{ success: boolean; agreement?: MentorshipAgreement; error?: string }> {
  // Validate mentorship exists and is active
  const [mentorship] = await sql`
    SELECT id, mentor_id, mentee_id, status FROM mentorships WHERE id = ${mentorshipId}
  `;
  if (!mentorship) {
    return { success: false, error: 'Mentorship not found' };
  }
  if (mentorship.status !== 'active') {
    return { success: false, error: 'Mentorship must be active to create an agreement' };
  }
  if (mentorship.mentor_id !== mentorId) {
    return { success: false, error: 'Only the mentor can propose a revenue-sharing agreement' };
  }

  // Check for existing active/pending agreement
  const [existing] = await sql`
    SELECT id FROM mentorship_agreements
    WHERE mentorship_id = ${mentorshipId} AND status IN ('active', 'pending')
  `;
  if (existing) {
    return { success: false, error: 'An active or pending agreement already exists for this mentorship' };
  }

  // Validate bounds
  if (sharePercentage < MIN_SHARE_PERCENTAGE || sharePercentage > MAX_SHARE_PERCENTAGE) {
    return { success: false, error: `Share percentage must be between ${MIN_SHARE_PERCENTAGE}% and ${MAX_SHARE_PERCENTAGE}%` };
  }
  if (durationMonths < MIN_DURATION_MONTHS || durationMonths > MAX_DURATION_MONTHS) {
    return { success: false, error: `Duration must be between ${MIN_DURATION_MONTHS} and ${MAX_DURATION_MONTHS} months` };
  }

  const [agreement] = await sql`
    INSERT INTO mentorship_agreements (mentorship_id, mentor_id, mentee_id, share_percentage, duration_months, min_earnings_cents, status)
    VALUES (${mentorshipId}, ${mentorship.mentor_id}, ${mentorship.mentee_id}, ${sharePercentage}, ${durationMonths}, ${minEarningsCents}, 'pending')
    RETURNING *
  `;

  return { success: true, agreement: agreement as unknown as MentorshipAgreement };
}

/**
 * Mentee accepts a pending agreement — activates it with an expiration date.
 */
export async function acceptAgreement(
  agreementId: number,
  menteeId: number
): Promise<{ success: boolean; agreement?: MentorshipAgreement; error?: string }> {
  const [agreement] = await sql`
    SELECT * FROM mentorship_agreements WHERE id = ${agreementId}
  `;
  if (!agreement) {
    return { success: false, error: 'Agreement not found' };
  }
  if (agreement.mentee_id !== menteeId) {
    return { success: false, error: 'Only the mentee can accept the agreement' };
  }
  if (agreement.status !== 'pending') {
    return { success: false, error: 'Agreement is not pending' };
  }

  const [updated] = await sql`
    UPDATE mentorship_agreements
    SET status = 'active', started_at = NOW(), expires_at = NOW() + (${agreement.duration_months} || ' months')::interval
    WHERE id = ${agreementId} AND status = 'pending'
    RETURNING *
  `;

  if (!updated) {
    return { success: false, error: 'Agreement was modified concurrently, please try again' };
  }

  return { success: true, agreement: updated as unknown as MentorshipAgreement };
}

/**
 * Mentee cancels an agreement (anytime, no penalty).
 */
export async function cancelAgreement(
  agreementId: number,
  userId: number
): Promise<{ success: boolean; error?: string }> {
  const [agreement] = await sql`
    SELECT * FROM mentorship_agreements WHERE id = ${agreementId}
  `;
  if (!agreement) {
    return { success: false, error: 'Agreement not found' };
  }
  if (agreement.mentee_id !== userId && agreement.mentor_id !== userId) {
    return { success: false, error: 'Only mentor or mentee can cancel' };
  }
  if (agreement.status !== 'active' && agreement.status !== 'pending') {
    return { success: false, error: 'Agreement is not active or pending' };
  }

  const [updated] = await sql`
    UPDATE mentorship_agreements SET status = 'cancelled', cancelled_at = NOW()
    WHERE id = ${agreementId} AND status IN ('active', 'pending')
    RETURNING id
  `;
  if (!updated) {
    return { success: false, error: 'Agreement was modified concurrently, please try again' };
  }
  return { success: true };
}

/**
 * Calculate and record the mentor's revenue split for a completed booking.
 * Returns the adjusted mentee payout amount (after split).
 * Returns the original amount unchanged if no active agreement exists.
 */
export async function applyRevenueSplit(
  menteeId: number,
  bookingId: number,
  sitterNetCents: number
): Promise<{ menteeAmount: number; mentorAmount: number; agreementId: number | null }> {
  // Find active, non-expired agreement for this mentee
  const [agreement] = await sql`
    SELECT * FROM mentorship_agreements
    WHERE mentee_id = ${menteeId} AND status = 'active' AND expires_at > NOW()
  `;

  if (!agreement) {
    return { menteeAmount: sitterNetCents, mentorAmount: 0, agreementId: null };
  }

  // Check min earnings threshold (sum booking_total_cents, not mentee_amount_cents)
  if (agreement.min_earnings_cents > 0) {
    const [{ total }] = await sql`
      SELECT COALESCE(SUM(booking_total_cents), 0)::int AS total
      FROM mentorship_payouts WHERE agreement_id = ${agreement.id}
    `;
    if (total < agreement.min_earnings_cents) {
      return { menteeAmount: sitterNetCents, mentorAmount: 0, agreementId: agreement.id };
    }
  }

  const mentorAmount = Math.round(sitterNetCents * (agreement.share_percentage / 100));
  const menteeAmount = sitterNetCents - mentorAmount;

  // Record the split — check RETURNING to detect concurrent duplicate
  const [inserted] = await sql`
    INSERT INTO mentorship_payouts (agreement_id, booking_id, mentor_amount_cents, mentee_amount_cents, booking_total_cents)
    VALUES (${agreement.id}, ${bookingId}, ${mentorAmount}, ${menteeAmount}, ${sitterNetCents})
    ON CONFLICT (booking_id) DO NOTHING
    RETURNING id
  `;

  if (!inserted) {
    // Another request already recorded a split for this booking — return no-split to avoid double payout
    return { menteeAmount: sitterNetCents, mentorAmount: 0, agreementId: null };
  }

  logger.info(
    { agreementId: agreement.id, bookingId, mentorAmount, menteeAmount, sharePercent: agreement.share_percentage },
    'Mentorship revenue split applied'
  );

  return { menteeAmount, mentorAmount, agreementId: agreement.id };
}

/**
 * Get agreements for a user (as mentor or mentee).
 */
export async function getAgreements(userId: number): Promise<{
  as_mentor: MentorshipAgreement[];
  as_mentee: MentorshipAgreement[];
}> {
  const asMentor = await sql`
    SELECT a.*, u.name AS mentee_name
    FROM mentorship_agreements a
    JOIN users u ON u.id = a.mentee_id
    WHERE a.mentor_id = ${userId}
    ORDER BY a.created_at DESC
  `;
  const asMentee = await sql`
    SELECT a.*, u.name AS mentor_name
    FROM mentorship_agreements a
    JOIN users u ON u.id = a.mentor_id
    WHERE a.mentee_id = ${userId}
    ORDER BY a.created_at DESC
  `;
  return {
    as_mentor: asMentor as unknown as MentorshipAgreement[],
    as_mentee: asMentee as unknown as MentorshipAgreement[],
  };
}

/**
 * Get mentorship earnings summary for a user.
 */
export async function getMentorshipEarnings(userId: number, year?: number): Promise<{
  total_earned_as_mentor: number;
  total_shared_as_mentee: number;
  payouts: MentorshipPayout[];
}> {
  const yearFilter = year
    ? sql`AND EXTRACT(YEAR FROM mp.created_at) = ${year}`
    : sql``;

  const earnedRows = await sql`
    SELECT COALESCE(SUM(mp.mentor_amount_cents), 0)::int AS total
    FROM mentorship_payouts mp
    JOIN mentorship_agreements ma ON ma.id = mp.agreement_id
    WHERE ma.mentor_id = ${userId} ${yearFilter}
  `;

  const sharedRows = await sql`
    SELECT COALESCE(SUM(mp.mentor_amount_cents), 0)::int AS total
    FROM mentorship_payouts mp
    JOIN mentorship_agreements ma ON ma.id = mp.agreement_id
    WHERE ma.mentee_id = ${userId} ${yearFilter}
  `;

  const payouts = await sql`
    SELECT mp.*
    FROM mentorship_payouts mp
    JOIN mentorship_agreements ma ON ma.id = mp.agreement_id
    WHERE ma.mentor_id = ${userId} OR ma.mentee_id = ${userId}
    ${yearFilter}
    ORDER BY mp.created_at DESC
    LIMIT 100
  `;

  return {
    total_earned_as_mentor: earnedRows[0]?.total ?? 0,
    total_shared_as_mentee: sharedRows[0]?.total ?? 0,
    payouts: payouts as unknown as MentorshipPayout[],
  };
}

/**
 * Expire agreements that have passed their expires_at date.
 * Should be called periodically (e.g., daily scheduler).
 */
export async function expireAgreements(): Promise<number> {
  const result = await sql`
    UPDATE mentorship_agreements SET status = 'expired'
    WHERE status = 'active' AND expires_at <= NOW()
  `;
  const count = result.count ?? 0;
  if (count > 0) {
    logger.info({ count }, 'Expired mentorship revenue agreements');
  }
  return count;
}
