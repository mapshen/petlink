import sql from './db.ts';
import { createNotification } from './notifications.ts';
import { sendEmail, buildBanActionEmail, buildAppealResponseEmail } from './email.ts';
import logger from './logger.ts';
import type { BanAction, BanAppeal, BanActionType, BanReason } from '../types.ts';

/**
 * Issue a ban action (warning, suspension, or ban) against a user.
 * Suspensions with expires_at auto-expire; bans are permanent until appealed.
 */
export async function issueBanAction(
  userId: number,
  actionType: BanActionType,
  reason: BanReason,
  description: string,
  issuedBy: number,
  expiresAt?: Date | null
): Promise<BanAction> {
  const [action] = await sql`
    INSERT INTO ban_actions (user_id, action_type, reason, description, issued_by, expires_at)
    VALUES (${userId}, ${actionType}, ${reason}, ${description}, ${issuedBy}, ${expiresAt?.toISOString() ?? null})
    RETURNING *
  `;

  // Update user approval_status for suspension/ban
  if (actionType === 'suspension') {
    await sql`
      UPDATE users SET approval_status = 'banned',
        approval_rejected_reason = ${description}
      WHERE id = ${userId}
    `;
  } else if (actionType === 'ban') {
    await sql`
      UPDATE users SET approval_status = 'banned',
        approval_rejected_reason = ${description}
      WHERE id = ${userId}
    `;
  }

  // In-app notification (always delivered for safety-critical)
  const titleMap: Record<BanActionType, string> = {
    warning: 'Account Warning',
    suspension: 'Account Suspended',
    ban: 'Account Banned',
  };
  const bodyMap: Record<BanActionType, string> = {
    warning: `You have received a warning: ${description}. Repeated violations may result in suspension.`,
    suspension: `Your account has been suspended: ${description}. You may submit an appeal.`,
    ban: `Your account has been permanently banned: ${description}. You may submit one appeal.`,
  };
  await createNotification(
    userId,
    'account_update',
    titleMap[actionType],
    bodyMap[actionType],
    { ban_action_id: action.id, action_type: actionType }
  );

  // Send email notification
  const [user] = await sql`SELECT email, name FROM users WHERE id = ${userId}`;
  if (user) {
    const emailContent = buildBanActionEmail({
      userName: user.name,
      actionType,
      reason,
      description,
      expiresAt: expiresAt ?? undefined,
    });
    sendEmail({ to: user.email, ...emailContent }).catch(() => {});
  }

  return action as unknown as BanAction;
}

/**
 * Get ban action history for a user (all actions, ordered by most recent).
 */
export async function getBanHistory(
  userId: number,
  limit = 50,
  offset = 0
): Promise<{ actions: BanAction[]; total: number }> {
  const actions = await sql`
    SELECT ba.*, u.name as issued_by_name
    FROM ban_actions ba
    LEFT JOIN users u ON u.id = ba.issued_by
    WHERE ba.user_id = ${userId}
    ORDER BY ba.issued_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  const [{ count }] = await sql`
    SELECT count(*)::int as count FROM ban_actions WHERE user_id = ${userId}
  `;
  return { actions: actions as unknown as BanAction[], total: count };
}

/**
 * Get the current effective ban status for a user.
 * Checks for active (non-expired) suspensions and permanent bans.
 */
export async function getEffectiveBanStatus(
  userId: number
): Promise<{ status: 'clear' | 'warning' | 'suspended' | 'banned'; action?: BanAction }> {
  // Check for permanent ban first
  const [ban] = await sql`
    SELECT * FROM ban_actions
    WHERE user_id = ${userId} AND action_type = 'ban'
      AND NOT EXISTS (
        SELECT 1 FROM ban_appeals
        WHERE ban_action_id = ban_actions.id AND status = 'approved'
      )
    ORDER BY issued_at DESC LIMIT 1
  `;
  if (ban) return { status: 'banned', action: ban as unknown as BanAction };

  // Check for active suspension
  const [suspension] = await sql`
    SELECT * FROM ban_actions
    WHERE user_id = ${userId} AND action_type = 'suspension'
      AND (expires_at IS NULL OR expires_at > NOW())
      AND NOT EXISTS (
        SELECT 1 FROM ban_appeals
        WHERE ban_action_id = ban_actions.id AND status = 'approved'
      )
    ORDER BY issued_at DESC LIMIT 1
  `;
  if (suspension) return { status: 'suspended', action: suspension as unknown as BanAction };

  // Check for recent warnings (non-expired, within 90 days)
  const [warning] = await sql`
    SELECT * FROM ban_actions
    WHERE user_id = ${userId} AND action_type = 'warning'
      AND issued_at > NOW() - INTERVAL '90 days'
    ORDER BY issued_at DESC LIMIT 1
  `;
  if (warning) return { status: 'warning', action: warning as unknown as BanAction };

  return { status: 'clear' };
}

/**
 * Submit an appeal for a ban action.
 * Only one appeal per ban action allowed.
 */
export async function submitAppeal(
  userId: number,
  banActionId: number,
  reason: string
): Promise<BanAppeal | null> {
  // Verify the ban action belongs to this user
  const [action] = await sql`
    SELECT id, user_id, action_type FROM ban_actions WHERE id = ${banActionId}
  `;
  if (!action || action.user_id !== userId) return null;

  // Only suspension and ban can be appealed
  if (action.action_type === 'warning') return null;

  // Check for existing appeal
  const [existing] = await sql`
    SELECT id FROM ban_appeals WHERE ban_action_id = ${banActionId}
  `;
  if (existing) return null;

  const [appeal] = await sql`
    INSERT INTO ban_appeals (user_id, ban_action_id, reason)
    VALUES (${userId}, ${banActionId}, ${reason})
    RETURNING *
  `;
  return appeal as unknown as BanAppeal;
}

/**
 * List pending appeals for admin review.
 */
export async function listPendingAppeals(
  limit = 50,
  offset = 0
): Promise<{ appeals: BanAppeal[]; total: number }> {
  const appeals = await sql`
    SELECT a.*, u.name as user_name, u.email as user_email,
           ba.action_type, ba.reason as ban_reason, ba.description as ban_description
    FROM ban_appeals a
    JOIN users u ON u.id = a.user_id
    JOIN ban_actions ba ON ba.id = a.ban_action_id
    WHERE a.status = 'pending'
    ORDER BY a.created_at ASC
    LIMIT ${limit} OFFSET ${offset}
  `;
  const [{ count }] = await sql`
    SELECT count(*)::int as count FROM ban_appeals WHERE status = 'pending'
  `;
  return { appeals: appeals as unknown as BanAppeal[], total: count };
}

/**
 * Admin reviews an appeal (approve or deny).
 */
export async function reviewAppeal(
  appealId: number,
  status: 'approved' | 'denied',
  adminResponse: string,
  reviewedBy: number
): Promise<BanAppeal | null> {
  const [appeal] = await sql`
    UPDATE ban_appeals
    SET status = ${status}, admin_response = ${adminResponse},
        reviewed_at = NOW(), reviewed_by = ${reviewedBy}
    WHERE id = ${appealId} AND status = 'pending'
    RETURNING *
  `;
  if (!appeal) return null;

  // If approved, restore user access
  if (status === 'approved') {
    await sql`
      UPDATE users SET approval_status = 'approved',
        approval_rejected_reason = NULL
      WHERE id = ${appeal.user_id}
    `;

    await createNotification(
      appeal.user_id,
      'account_update',
      'Appeal Approved',
      'Your appeal has been approved and your account has been restored.',
      { appeal_id: appealId }
    );
  } else {
    await createNotification(
      appeal.user_id,
      'account_update',
      'Appeal Denied',
      `Your appeal has been denied: ${adminResponse}`,
      { appeal_id: appealId }
    );
  }

  // Send email
  const [user] = await sql`SELECT email, name FROM users WHERE id = ${appeal.user_id}`;
  if (user) {
    const emailContent = buildAppealResponseEmail({
      userName: user.name,
      status,
      adminResponse,
    });
    sendEmail({ to: user.email, ...emailContent }).catch(() => {});
  }

  return appeal as unknown as BanAppeal;
}

/**
 * Check and auto-expire suspensions that have passed their expires_at.
 * Called from auth middleware or scheduler.
 */
export async function checkSuspensionExpiry(userId: number): Promise<boolean> {
  const [expired] = await sql`
    SELECT ba.id FROM ban_actions ba
    WHERE ba.user_id = ${userId}
      AND ba.action_type = 'suspension'
      AND ba.expires_at IS NOT NULL
      AND ba.expires_at <= NOW()
      AND NOT EXISTS (
        SELECT 1 FROM ban_actions ba2
        WHERE ba2.user_id = ${userId}
          AND ba2.action_type = 'ban'
          AND NOT EXISTS (
            SELECT 1 FROM ban_appeals
            WHERE ban_action_id = ba2.id AND status = 'approved'
          )
      )
  `;

  if (expired) {
    // No active ban — check if there's no non-expired suspension still active
    const [activeSuspension] = await sql`
      SELECT id FROM ban_actions
      WHERE user_id = ${userId} AND action_type = 'suspension'
        AND (expires_at IS NULL OR expires_at > NOW())
        AND NOT EXISTS (
          SELECT 1 FROM ban_appeals
          WHERE ban_action_id = ban_actions.id AND status = 'approved'
        )
    `;

    if (!activeSuspension) {
      await sql`
        UPDATE users SET approval_status = 'approved', approval_rejected_reason = NULL
        WHERE id = ${userId} AND approval_status = 'banned'
      `;
      await createNotification(
        userId,
        'account_update',
        'Suspension Expired',
        'Your suspension has expired and your account has been restored.',
        {}
      );
      return true;
    }
  }
  return false;
}
