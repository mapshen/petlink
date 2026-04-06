import sql from './db.ts';
import { createNotification } from './notifications.ts';
import logger from './logger.ts';

export type StrikeEventType = 'sitter_no_show' | 'sitter_cancel_24h' | 'sitter_cancel_48h' | 'meet_greet_no_show' | 'dispute_resolution';

const STRIKE_WEIGHTS: Record<StrikeEventType, number> = {
  sitter_no_show: 2,
  sitter_cancel_24h: 1,
  sitter_cancel_48h: 0.5,
  meet_greet_no_show: 1,
  dispute_resolution: 1,
};

const ROLLING_WINDOW_DAYS = 90;

// Consequence thresholds
const THRESHOLD_WARNING = 1;
const THRESHOLD_FLAGGED = 3;
const THRESHOLD_DEMOTION = 5;
const THRESHOLD_SUSPENSION = 7;

export interface Strike {
  id: number;
  sitter_id: number;
  booking_id: number | null;
  event_type: StrikeEventType;
  strike_weight: number;
  description: string;
  created_at: string;
  expires_at: string;
}

/**
 * Record a strike against a sitter.
 */
export async function recordStrike(
  sitterId: number,
  eventType: StrikeEventType,
  description: string,
  bookingId?: number | null
): Promise<Strike> {
  const weight = STRIKE_WEIGHTS[eventType];
  const [strike] = await sql`
    INSERT INTO sitter_strikes (sitter_id, booking_id, event_type, strike_weight, description, expires_at)
    VALUES (${sitterId}, ${bookingId ?? null}, ${eventType}, ${weight}, ${description},
            NOW() + INTERVAL '${sql.unsafe(String(ROLLING_WINDOW_DAYS))} days')
    RETURNING *
  `;
  return strike as unknown as Strike;
}

/**
 * Get the total active (non-expired) strike weight for a sitter.
 */
export async function getActiveStrikeWeight(sitterId: number): Promise<number> {
  const [row] = await sql`
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
 * Returns the current consequence level and takes appropriate action.
 */
export async function evaluateConsequences(
  sitterId: number
): Promise<{ level: 'none' | 'warning' | 'flagged' | 'demotion' | 'suspension'; activeWeight: number }> {
  const activeWeight = await getActiveStrikeWeight(sitterId);

  if (activeWeight >= THRESHOLD_SUSPENSION) {
    await sql`UPDATE users SET approval_status = 'banned', approval_rejected_reason = 'Automated suspension: reliability threshold exceeded' WHERE id = ${sitterId} AND approval_status = 'approved'`;
    await createNotification(sitterId, 'account_update', 'Account Suspended', 'Your account has been suspended due to reliability concerns. Please contact support.', {});
    logger.warn({ sitterId, activeWeight }, 'Sitter suspended due to reliability strikes');
    return { level: 'suspension', activeWeight };
  }

  if (activeWeight >= THRESHOLD_DEMOTION) {
    await createNotification(sitterId, 'account_update', 'Search Visibility Reduced', 'Your search ranking has been reduced due to recent cancellations or no-shows. Maintain good standing for 90 days to restore it.', {});
    return { level: 'demotion', activeWeight };
  }

  if (activeWeight >= THRESHOLD_FLAGGED) {
    await createNotification(sitterId, 'account_update', 'Reliability Notice', 'Your account has been flagged for admin review due to recent cancellations. Please maintain your bookings to avoid further action.', {});
    return { level: 'flagged', activeWeight };
  }

  if (activeWeight >= THRESHOLD_WARNING) {
    await createNotification(sitterId, 'account_update', 'Reliability Warning', 'A cancellation or missed booking has been recorded. Repeated issues may affect your search ranking.', {});
    return { level: 'warning', activeWeight };
  }

  return { level: 'none', activeWeight };
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
  return null; // No strike for cancellations 48+ hours before
}
