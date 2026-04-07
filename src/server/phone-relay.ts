import sql from './db.ts';

const ACTIVE_BOOKING_STATUSES = ['confirmed', 'in_progress'] as const;

/**
 * Mask a phone number, showing only the last 4 digits.
 * Returns null for null/undefined/empty input.
 */
export function maskPhoneNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;

  const digits = phone.replace(/\D/g, '');
  if (digits.length === 0) return null;
  if (digits.length <= 4) return digits;
  if (digits.length <= 7) return `***-${digits.slice(-4)}`;
  return `***-***-${digits.slice(-4)}`;
}

type ContactResult =
  | {
      name: string;
      avatar_url: string | null;
      phone: string | null;
      masked_phone: string | null;
      role: 'owner' | 'sitter';
    }
  | { error: 'not_found' | 'forbidden' | 'booking_not_active' };

/**
 * Get the contact info for the other party in a booking.
 * Only returns phone info for active (confirmed/in_progress) bookings
 * where the other party has opted in to sharing.
 */
export async function getBookingContact(
  bookingId: number,
  requestingUserId: number,
): Promise<ContactResult> {
  const [booking] = await sql`
    SELECT id, owner_id, sitter_id, status
    FROM bookings
    WHERE id = ${bookingId}
  `;

  if (!booking) {
    return { error: 'not_found' };
  }

  const isOwner = booking.owner_id === requestingUserId;
  const isSitter = booking.sitter_id === requestingUserId;

  if (!isOwner && !isSitter) {
    return { error: 'forbidden' };
  }

  if (!ACTIVE_BOOKING_STATUSES.includes(booking.status)) {
    return { error: 'booking_not_active' };
  }

  // Get the OTHER party's info
  const otherUserId = isOwner ? booking.sitter_id : booking.owner_id;
  const otherRole = isOwner ? 'sitter' : 'owner';

  const [otherUser] = await sql`
    SELECT id, name, avatar_url, phone, share_phone_for_bookings
    FROM users
    WHERE id = ${otherUserId}
  `;

  const firstName = otherUser.name.split(' ')[0];
  const canSharePhone = otherUser.share_phone_for_bookings && otherUser.phone;

  return {
    name: firstName,
    avatar_url: otherUser.avatar_url || null,
    phone: canSharePhone ? otherUser.phone : null,
    masked_phone: canSharePhone ? maskPhoneNumber(otherUser.phone) : null,
    role: otherRole,
  };
}
