import sql from './db.ts';
import { createNotification } from './notifications.ts';
import logger from './logger.ts';
import type { Strike, StrikeEventType } from '../types.ts';

const STRIKE_WEIGHTS: Record<StrikeEventType, number> = {
  sitter_no_show: 2,
  sitter_cancel_24h: 1,
  sitter_cancel_48h: 0.5,
  meet_greet_no_show: 1,
  dispute_resolution: 1,
};

const ROLLING_WINDOW_DAYS = 90;

// Exported thresholds — used by routes and ranking
export const THRESHOLDS = {
  WARNING: 1,
  FLAGGED: 3,
  DEMOTION: 5,
  SUSPENSION: 7,
} as const;

/**
 * Record a strike against a sitter.
 * Accepts optional transaction handle for atomicity.
 */
export async function recordStrike(
  sitterId: number,
  eventType: StrikeEventType,
  description: string,
  bookingId?: number | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx?: any
): Promise<Strike> {
  const weight = STRIKE_WEIGHTS[eventType];
  const expiresAt = new Date(Date.now() + ROLLING_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const query = tx ?? sql;
  const [strike] = await query`
    INSERT INTO sitter_strikes (sitter_id, booking_id, event_type, strike_weight, description, expires_at)
    VALUES (${sitterId}, ${bookingId ?? null}, ${eventType}, ${weight}, ${description}, ${expiresAt})
    ON CONFLICT (booking_id, event_type) WHERE booking_id IS NOT NULL DO NOTHING
    RETURNING *
  `;
  if (!strike) {
    // Duplicate — strike already recorded for this booking+event
    const [existing] = await query`
      SELECT * FROM sitter_strikes WHERE booking_id = ${bookingId} AND event_type = ${eventType}
    `;
    return existing as unknown as Strike;
  }
  return strike as unknown as Strike;
}

/**
 * Get the total active (non-expired) strike weight for a sitter.
 */
export async function getActiveStrikeWeight(
  sitterId: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx?: any
): Promise<number> {
  const query = tx ?? sql;
  const [row] = await query`
    SELECT COALESCE(SUM(strike_weight), 0)::float AS total
    FROM sitter_strikes
    WHERE sitter_id = ${sitterId} AND expires_at > NOW()
  `;
  return row.total;
}

/**
 * Get paginated strike history for a sitter.
 */
export async function getStrikeHistory(
  sitterId: number,
  limit = 50,
  offset = 0
): Promise<Strike[]> {
  const strikes = await sql`
    SELECT id, sitter_id, booking_id, event_type, strike_weight, description, created_at, expires_at
    FROM sitter_strikes
    WHERE sitter_id = ${sitterId}
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  return strikes as unknown as Strike[];
}

/**
 * Evaluate consequences based on active strike weight.
 * Only sends notifications on level transitions to avoid spam.
 */
export async function evaluateConsequences(
  sitterId: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx?: any
): Promise<{ level: 'none' | 'warning' | 'flagged' | 'demotion' | 'suspension'; activeWeight: number }> {
  const query = tx ?? sql;
  const activeWeight = await getActiveStrikeWeight(sitterId, tx);

  let level: 'none' | 'warning' | 'flagged' | 'demotion' | 'suspension' = 'none';
  if (activeWeight >= THRESHOLDS.SUSPENSION) level = 'suspension';
  else if (activeWeight >= THRESHOLDS.DEMOTION) level = 'demotion';
  else if (activeWeight >= THRESHOLDS.FLAGGED) level = 'flagged';
  else if (activeWeight >= THRESHOLDS.WARNING) level = 'warning';

  // Check if level changed — only act on transitions
  const [user] = await query`SELECT reliability_level FROM users WHERE id = ${sitterId}`;
  const previousLevel = user?.reliability_level || 'none';

  if (level !== previousLevel) {
    await query`UPDATE users SET reliability_level = ${level} WHERE id = ${sitterId}`;

    if (level === 'suspension') {
      await query`UPDATE users SET approval_status = 'banned', approval_rejected_reason = 'Automated suspension: reliability threshold exceeded' WHERE id = ${sitterId} AND approval_status = 'approved'`;
      await createNotification(sitterId, 'account_update', 'Account Suspended', 'Your account has been suspended due to reliability concerns. Please contact support.', {});
      logger.warn({ sitterId, activeWeight }, 'Sitter suspended due to reliability strikes');
    } else if (level === 'demotion') {
      await createNotification(sitterId, 'account_update', 'Search Visibility Reduced', 'Your search ranking has been reduced due to recent cancellations or no-shows. Maintain good standing for 90 days to restore it.', {});
    } else if (level === 'flagged') {
      await createNotification(sitterId, 'account_update', 'Reliability Notice', 'Your account has been flagged for admin review due to recent cancellations. Please maintain your bookings to avoid further action.', {});
    } else if (level === 'warning') {
      await createNotification(sitterId, 'account_update', 'Reliability Warning', 'A cancellation or missed booking has been recorded. Repeated issues may affect your search ranking.', {});
    }
  }

  return { level, activeWeight };
}

/**
 * Determine strike event type based on cancellation timing.
 */
export function getStrikeEventForCancellation(
  startTime: Date,
  cancelTime: Date
): StrikeEventType | null {
  const hoursUntilStart = (startTime.getTime() - cancelTime.getTime()) / (1000 * 60 * 60);
  if (hoursUntilStart < 24) return 'sitter_cancel_24h';
  if (hoursUntilStart < 48) return 'sitter_cancel_48h';
  return null;
}
