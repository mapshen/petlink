import sql from './db.ts';
import { issueCredit } from './credits.ts';
import { dollarsToCents } from '../lib/money.ts';
import logger, { sanitizeError } from './logger.ts';

// --- Constants ---
export const MENTOR_CREDIT_CENTS = dollarsToCents(15);
export const MENTEE_CREDIT_CENTS = dollarsToCents(5);
export const MIN_COMPLETED_BOOKINGS = 10;
export const MIN_AVG_RATING = 4.5;
export const MIN_MONTHS_ON_PLATFORM = 3;
export const MENTEE_COMPLETION_BOOKINGS = 3;
export const MENTEE_ELIGIBILITY_DAYS = 30;
export const MAX_ACTIVE_MENTORSHIPS_PER_MENTOR = 3;

export type MentorshipStatus = 'active' | 'completed' | 'cancelled';

export interface Mentorship {
  readonly id: number;
  readonly mentor_id: number;
  readonly mentee_id: number;
  readonly status: MentorshipStatus;
  readonly started_at: string;
  readonly completed_at: string | null;
  readonly notes: string | null;
  readonly mentor_name?: string;
  readonly mentor_avatar?: string | null;
  readonly mentee_name?: string;
  readonly mentee_avatar?: string | null;
}

export interface MentorEligibility {
  readonly eligible: boolean;
  readonly reasons: string[];
}

export interface MentorProfile {
  readonly id: number;
  readonly name: string;
  readonly avatar_url: string | null;
  readonly bio: string | null;
  readonly completed_bookings: number;
  readonly avg_rating: number | null;
  readonly review_count: number;
  readonly years_experience: number | null;
  readonly accepted_species: string[];
  readonly distance_meters?: number;
  readonly is_mentor: boolean;
  readonly active_mentee_count: number;
}

/**
 * Pure eligibility check — no DB access.
 * Tests mentor criteria from pre-fetched stats.
 */
export function checkMentorEligibility(stats: {
  readonly approval_status: string;
  readonly roles: string[];
  readonly completed_bookings: number;
  readonly avg_rating: number | null;
  readonly created_at: string;
}): MentorEligibility {
  const reasons: string[] = [];

  if (!stats.roles.includes('sitter')) {
    reasons.push('Must have the sitter role');
  }

  if (stats.approval_status !== 'approved') {
    reasons.push('Must have approved status');
  }

  if (stats.completed_bookings < MIN_COMPLETED_BOOKINGS) {
    reasons.push(`Need at least ${MIN_COMPLETED_BOOKINGS} completed bookings (have ${stats.completed_bookings})`);
  }

  if (stats.avg_rating === null || stats.avg_rating < MIN_AVG_RATING) {
    const display = stats.avg_rating === null ? 'none' : stats.avg_rating.toFixed(1);
    reasons.push(`Need ${MIN_AVG_RATING}+ average rating (have ${display})`);
  }

  const createdDate = new Date(stats.created_at);
  const monthsOnPlatform = monthsBetween(createdDate, new Date());
  if (monthsOnPlatform < MIN_MONTHS_ON_PLATFORM) {
    reasons.push(`Need ${MIN_MONTHS_ON_PLATFORM}+ months on platform (have ${monthsOnPlatform})`);
  }

  return { eligible: reasons.length === 0, reasons };
}

/** Compute approximate months between two dates. */
export function monthsBetween(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

/**
 * Fetch mentor eligibility stats for a user from the database.
 */
export async function getMentorEligibilityStats(userId: number): Promise<{
  approval_status: string;
  roles: string[];
  completed_bookings: number;
  avg_rating: number | null;
  created_at: string;
}> {
  const [user] = await sql`
    SELECT approval_status, roles, created_at FROM users WHERE id = ${userId}
  `;
  if (!user) {
    throw new Error('User not found');
  }

  const [bookingStats] = await sql`
    SELECT COUNT(*)::int AS completed_bookings
    FROM bookings
    WHERE sitter_id = ${userId} AND status = 'completed'
  `;

  const [ratingStats] = await sql`
    SELECT AVG(rating)::float AS avg_rating
    FROM reviews
    WHERE reviewee_id = ${userId} AND published_at IS NOT NULL AND hidden_at IS NULL
  `;

  return {
    approval_status: user.approval_status,
    roles: user.roles,
    completed_bookings: bookingStats.completed_bookings,
    avg_rating: ratingStats.avg_rating,
    created_at: user.created_at,
  };
}

/**
 * Enroll a sitter as a mentor. Validates eligibility first.
 */
export async function enrollAsMentor(userId: number): Promise<{ success: boolean; error?: string }> {
  const stats = await getMentorEligibilityStats(userId);
  const eligibility = checkMentorEligibility(stats);

  if (!eligibility.eligible) {
    return { success: false, error: eligibility.reasons[0] };
  }

  await sql`UPDATE users SET is_mentor = true WHERE id = ${userId}`;
  return { success: true };
}

/**
 * Unenroll a sitter from mentoring.
 */
export async function unenrollAsMentor(userId: number): Promise<void> {
  await sql`UPDATE users SET is_mentor = false WHERE id = ${userId}`;
}

/**
 * List available mentors, optionally sorted by proximity.
 */
export async function getAvailableMentors(opts?: {
  lat?: number;
  lng?: number;
  limit?: number;
  offset?: number;
}): Promise<MentorProfile[]> {
  const limit = Math.min(Math.max(opts?.limit ?? 20, 1), 50);
  const offset = Math.max(opts?.offset ?? 0, 0);

  if (opts?.lat != null && opts?.lng != null) {
    const rows = await sql`
      SELECT
        u.id, u.name, u.avatar_url, u.bio, u.is_mentor, u.accepted_species,
        u.years_experience,
        COUNT(DISTINCT b.id) FILTER (WHERE b.status = 'completed')::int AS completed_bookings,
        AVG(r.rating)::float AS avg_rating,
        COUNT(DISTINCT r.id)::int AS review_count,
        ST_Distance(u.location, ST_SetSRID(ST_MakePoint(${opts.lng}, ${opts.lat}), 4326)::geography) AS distance_meters,
        (SELECT COUNT(*)::int FROM mentorships m WHERE m.mentor_id = u.id AND m.status = 'active') AS active_mentee_count
      FROM users u
      LEFT JOIN bookings b ON b.sitter_id = u.id
      LEFT JOIN reviews r ON r.reviewee_id = u.id AND r.published_at IS NOT NULL AND r.hidden_at IS NULL
      WHERE u.is_mentor = true AND u.approval_status = 'approved'
      GROUP BY u.id
      HAVING (SELECT COUNT(*)::int FROM mentorships m WHERE m.mentor_id = u.id AND m.status = 'active') < ${MAX_ACTIVE_MENTORSHIPS_PER_MENTOR}
      ORDER BY distance_meters ASC NULLS LAST
      LIMIT ${limit} OFFSET ${offset}
    `;
    return rows as unknown as MentorProfile[];
  }

  const rows = await sql`
    SELECT
      u.id, u.name, u.avatar_url, u.bio, u.is_mentor, u.accepted_species,
      u.years_experience,
      COUNT(DISTINCT b.id) FILTER (WHERE b.status = 'completed')::int AS completed_bookings,
      AVG(r.rating)::float AS avg_rating,
      COUNT(DISTINCT r.id)::int AS review_count,
      (SELECT COUNT(*)::int FROM mentorships m WHERE m.mentor_id = u.id AND m.status = 'active') AS active_mentee_count
    FROM users u
    LEFT JOIN bookings b ON b.sitter_id = u.id
    LEFT JOIN reviews r ON r.reviewee_id = u.id AND r.published_at IS NOT NULL AND r.hidden_at IS NULL
    WHERE u.is_mentor = true AND u.approval_status = 'approved'
    GROUP BY u.id
    HAVING (SELECT COUNT(*)::int FROM mentorships m WHERE m.mentor_id = u.id AND m.status = 'active') < ${MAX_ACTIVE_MENTORSHIPS_PER_MENTOR}
    ORDER BY completed_bookings DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  return rows as unknown as MentorProfile[];
}

/**
 * Request a mentorship (mentee picks mentor).
 */
export async function requestMentorship(
  menteeId: number,
  mentorId: number,
  notes?: string | null
): Promise<{ success: boolean; mentorship?: Mentorship; error?: string }> {
  // Validate mentee is a sitter
  const [mentee] = await sql`
    SELECT roles, created_at FROM users WHERE id = ${menteeId}
  `;
  if (!mentee || !mentee.roles.includes('sitter')) {
    return { success: false, error: 'Mentee must be a sitter' };
  }

  // Mentee eligibility: within first 30 days
  const daysSinceCreation = Math.floor(
    (Date.now() - new Date(mentee.created_at).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (daysSinceCreation > MENTEE_ELIGIBILITY_DAYS) {
    return { success: false, error: 'Mentorship is only available within the first 30 days of joining' };
  }

  // Validate mentor
  const [mentor] = await sql`
    SELECT id, is_mentor, approval_status FROM users WHERE id = ${mentorId}
  `;
  if (!mentor || !mentor.is_mentor || mentor.approval_status !== 'approved') {
    return { success: false, error: 'Selected mentor is not available' };
  }

  // Check mentor capacity
  const [{ count: activeMenteeCount }] = await sql`
    SELECT COUNT(*)::int AS count FROM mentorships WHERE mentor_id = ${mentorId} AND status = 'active'
  `;
  if (activeMenteeCount >= MAX_ACTIVE_MENTORSHIPS_PER_MENTOR) {
    return { success: false, error: 'This mentor has reached their maximum number of active mentees' };
  }

  // Prevent duplicate active mentorship
  const [existing] = await sql`
    SELECT id FROM mentorships WHERE mentee_id = ${menteeId} AND status = 'active'
  `;
  if (existing) {
    return { success: false, error: 'You already have an active mentorship' };
  }

  // Cannot mentor yourself
  if (menteeId === mentorId) {
    return { success: false, error: 'You cannot mentor yourself' };
  }

  const [mentorship] = await sql`
    INSERT INTO mentorships (mentor_id, mentee_id, notes)
    VALUES (${mentorId}, ${menteeId}, ${notes ?? null})
    RETURNING *
  `;

  return { success: true, mentorship: mentorship as unknown as Mentorship };
}

/**
 * Get current mentorships for a user (as mentor or mentee).
 */
export async function getMentorships(userId: number): Promise<{
  as_mentor: Mentorship[];
  as_mentee: Mentorship[];
}> {
  const asMentor = await sql`
    SELECT m.*, u.name AS mentee_name, u.avatar_url AS mentee_avatar
    FROM mentorships m
    JOIN users u ON u.id = m.mentee_id
    WHERE m.mentor_id = ${userId}
    ORDER BY m.started_at DESC
  `;

  const asMentee = await sql`
    SELECT m.*, u.name AS mentor_name, u.avatar_url AS mentor_avatar
    FROM mentorships m
    JOIN users u ON u.id = m.mentor_id
    WHERE m.mentee_id = ${userId}
    ORDER BY m.started_at DESC
  `;

  return {
    as_mentor: asMentor as unknown as Mentorship[],
    as_mentee: asMentee as unknown as Mentorship[],
  };
}

/**
 * Check if a mentee has completed enough bookings to graduate.
 * If so, auto-complete the mentorship and issue credits to both parties.
 * Called after a booking is marked as completed.
 */
export async function checkMentorshipCompletion(menteeId: number): Promise<void> {
  try {
    const [activeMentorship] = await sql`
      SELECT id, mentor_id, mentee_id
      FROM mentorships
      WHERE mentee_id = ${menteeId} AND status = 'active'
    `;

    if (!activeMentorship) return;

    const [{ count: completedBookings }] = await sql`
      SELECT COUNT(*)::int AS count
      FROM bookings
      WHERE sitter_id = ${menteeId} AND status = 'completed'
    `;

    if (completedBookings < MENTEE_COMPLETION_BOOKINGS) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await sql.begin(async (tx: any) => {
      // Mark mentorship as completed
      await tx`
        UPDATE mentorships SET status = 'completed', completed_at = NOW()
        WHERE id = ${activeMentorship.id} AND status = 'active'
      `;

      // Issue mentor credit
      await issueCredit(
        activeMentorship.mentor_id,
        MENTOR_CREDIT_CENTS,
        'milestone',
        'system',
        'Mentor reward: mentee completed onboarding',
        activeMentorship.id,
        null,
        tx
      );

      // Issue mentee credit
      await issueCredit(
        activeMentorship.mentee_id,
        MENTEE_CREDIT_CENTS,
        'milestone',
        'system',
        'Mentorship completion bonus',
        activeMentorship.id,
        null,
        tx
      );
    });

    logger.info(
      { mentorshipId: activeMentorship.id, mentorId: activeMentorship.mentor_id, menteeId },
      'Mentorship completed — credits issued'
    );
  } catch (error) {
    logger.error({ err: sanitizeError(error), menteeId }, 'Mentorship completion check failed');
  }
}

/**
 * Admin: manually complete a mentorship (bypass booking count check).
 */
export async function adminCompleteMentorship(mentorshipId: number): Promise<{ success: boolean; error?: string }> {
  const [mentorship] = await sql`
    SELECT id, mentor_id, mentee_id, status FROM mentorships WHERE id = ${mentorshipId}
  `;

  if (!mentorship) {
    return { success: false, error: 'Mentorship not found' };
  }

  if (mentorship.status !== 'active') {
    return { success: false, error: 'Mentorship is not active' };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await sql.begin(async (tx: any) => {
    await tx`
      UPDATE mentorships SET status = 'completed', completed_at = NOW()
      WHERE id = ${mentorshipId}
    `;

    await issueCredit(
      mentorship.mentor_id,
      MENTOR_CREDIT_CENTS,
      'milestone',
      'system',
      'Mentor reward: mentee completed onboarding (admin)',
      mentorshipId,
      null,
      tx
    );

    await issueCredit(
      mentorship.mentee_id,
      MENTEE_CREDIT_CENTS,
      'milestone',
      'system',
      'Mentorship completion bonus (admin)',
      mentorshipId,
      null,
      tx
    );
  });

  return { success: true };
}

/**
 * Cancel a mentorship (either party can cancel).
 */
export async function cancelMentorship(
  mentorshipId: number,
  userId: number
): Promise<{ success: boolean; error?: string }> {
  const [mentorship] = await sql`
    SELECT id, mentor_id, mentee_id, status FROM mentorships WHERE id = ${mentorshipId}
  `;

  if (!mentorship) {
    return { success: false, error: 'Mentorship not found' };
  }

  if (mentorship.status !== 'active') {
    return { success: false, error: 'Mentorship is not active' };
  }

  if (mentorship.mentor_id !== userId && mentorship.mentee_id !== userId) {
    return { success: false, error: 'Only mentor or mentee can cancel' };
  }

  await sql`
    UPDATE mentorships SET status = 'cancelled' WHERE id = ${mentorshipId}
  `;

  return { success: true };
}
