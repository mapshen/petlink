import sql from './db.ts';
import logger, { sanitizeError } from './logger.ts';
import { createNotification } from './notifications.ts';
import type { EmergencyContact } from '../types.ts';

const ACTIVE_BOOKING_STATUSES = ['confirmed', 'in_progress'] as const;

type RevealResult =
  | { success: true; contact: EmergencyContact }
  | { error: 'not_found' | 'forbidden' | 'booking_not_active' | 'no_emergency_contact' };

/**
 * Reveal the other party's emergency contact for an active booking.
 * Logs every access and sends a mandatory notification to the contact owner.
 */
export async function revealEmergencyContact(
  bookingId: number,
  requestingUserId: number,
): Promise<RevealResult> {
  // 1. Fetch booking
  const [booking] = await sql`
    SELECT id, owner_id, sitter_id, status
    FROM bookings
    WHERE id = ${bookingId}
  `;

  if (!booking) {
    return { error: 'not_found' };
  }

  // 2. Validate user is owner or sitter on this booking
  const isOwner = booking.owner_id === requestingUserId;
  const isSitter = booking.sitter_id === requestingUserId;

  if (!isOwner && !isSitter) {
    return { error: 'forbidden' };
  }

  // 3. Validate booking is active
  if (!ACTIVE_BOOKING_STATUSES.includes(booking.status)) {
    return { error: 'booking_not_active' };
  }

  // 4. Get other party's emergency contact
  const otherUserId = isOwner ? booking.sitter_id : booking.owner_id;

  const [otherUser] = await sql`
    SELECT emergency_contact_name, emergency_contact_phone,
           emergency_contact_relationship
    FROM users
    WHERE id = ${otherUserId}
  `;

  if (!otherUser?.emergency_contact_name && !otherUser?.emergency_contact_phone) {
    return { error: 'no_emergency_contact' };
  }

  // 5. Log access + notify in transaction for atomicity
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await sql.begin(async (tx: any) => {
    await tx`
      INSERT INTO emergency_contact_access_log
        (booking_id, accessed_by, contact_owner_id)
      VALUES (${bookingId}, ${requestingUserId}, ${otherUserId})
    `;

    // 6. Get requester name for notification
    const [requester] = await tx`
      SELECT name FROM users WHERE id = ${requestingUserId}
    `;

    // 7. Send mandatory notification (always — safety/audit, bypasses preferences)
    try {
      await createNotification(
        otherUserId,
        'emergency_contact_viewed',
        'Emergency contact viewed',
        `${requester?.name || 'Someone'} viewed your emergency contact for booking #${bookingId}`,
      );
    } catch (notifyError) {
      logger.error({ err: sanitizeError(notifyError) }, 'Failed to send emergency contact notification');
      // Don't block the reveal — audit log is already persisted
    }
  });

  return {
    success: true,
    contact: {
      name: otherUser.emergency_contact_name,
      phone: otherUser.emergency_contact_phone,
      relationship: otherUser.emergency_contact_relationship,
    },
  };
}
