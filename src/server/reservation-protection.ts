import sql from './db.ts';
import { createNotification } from './notifications.ts';
import { sendEmail, buildReservationProtectionEmail } from './email.ts';
import logger, { sanitizeError } from './logger.ts';

const PROTECTION_WINDOW_MS = 48 * 60 * 60 * 1000; // 48 hours
const REPLACEMENT_SEARCH_RADIUS_METERS = 50_000; // 50km / ~31 miles

/**
 * Determine if reservation protection should trigger.
 * Only triggers for confirmed bookings cancelled within 48h of start.
 */
export function shouldTriggerProtection(
  previousStatus: string,
  startTime: Date
): boolean {
  if (previousStatus !== 'confirmed') return false;
  const msUntilStart = startTime.getTime() - Date.now();
  if (msUntilStart < 0) return false;
  return msUntilStart <= PROTECTION_WINDOW_MS;
}

interface ProtectionBooking {
  id: number;
  owner_id: number;
  sitter_id: number;
  service_id: number;
  start_time: string;
  end_time: string;
  total_price_cents: number;
}

/**
 * Trigger reservation protection for a sitter-cancelled confirmed booking.
 * - Creates a protection record
 * - Searches for replacement sitters
 * - Notifies the owner
 */
export async function triggerReservationProtection(
  booking: ProtectionBooking
): Promise<void> {
  try {
    // Create protection record (unique per booking)
    const [protection] = await sql`
      INSERT INTO reservation_protections (booking_id, original_sitter_id, owner_id)
      VALUES (${booking.id}, ${booking.sitter_id}, ${booking.owner_id})
      ON CONFLICT (booking_id) DO NOTHING
      RETURNING id
    `.catch(() => [] as any[]);

    if (!protection) {
      logger.info({ bookingId: booking.id }, 'Reservation protection already exists for this booking');
      return;
    }

    // Find replacement sitters: same service type, nearby, available, approved
    const [service] = await sql`
      SELECT type, price_cents FROM services WHERE id = ${booking.service_id}
    `.catch(() => [] as any[]);

    const [originalSitter] = await sql`
      SELECT name, lat, lng FROM users WHERE id = ${booking.sitter_id}
    `.catch(() => [] as any[]);

    let replacementSitters: { id: number; name: string; slug: string; price_cents: number; avg_rating: number | null }[] = [];

    if (originalSitter?.lat && originalSitter?.lng && service) {
      replacementSitters = await findReplacementSitters(
        booking.sitter_id, service.type, originalSitter.lat, originalSitter.lng
      );
    }

    const hasAlternatives = replacementSitters.length > 0;
    const newStatus = hasAlternatives ? 'options_sent' : 'no_alternatives';

    await sql`
      UPDATE reservation_protections
      SET status = ${newStatus}
      WHERE id = ${protection.id}
    `.catch(() => {});

    // Get owner info for notification
    const [owner] = await sql`
      SELECT name, email FROM users WHERE id = ${booking.owner_id}
    `.catch(() => [] as any[]);

    if (!owner) return;

    // Send notification
    await createNotification(
      booking.owner_id,
      'booking_status',
      'Sitter Cancelled — We\'re Helping',
      hasAlternatives
        ? `Your sitter cancelled. We found ${replacementSitters.length} alternative sitter${replacementSitters.length !== 1 ? 's' : ''} for you.`
        : 'Your sitter cancelled. We\'re looking for alternatives in your area.',
      { booking_id: booking.id }
    );

    // Send email
    const emailContent = buildReservationProtectionEmail({
      ownerName: owner.name,
      originalSitterName: originalSitter?.name || 'your sitter',
      startTime: booking.start_time,
      replacementSitters: replacementSitters.map(s => ({
        name: s.name,
        priceCents: s.price_cents,
        profileUrl: `${process.env.APP_URL || 'https://petlink.app'}/sitter/${s.slug || s.id}`,
        avgRating: s.avg_rating,
      })),
      noAlternatives: !hasAlternatives,
    });
    sendEmail({ to: owner.email, ...emailContent }).catch(() => {});

    logger.info({
      bookingId: booking.id,
      protectionId: protection.id,
      replacementCount: replacementSitters.length,
    }, 'Reservation protection triggered');
  } catch (err) {
    logger.error({ err: sanitizeError(err), bookingId: booking.id }, 'Failed to trigger reservation protection');
  }
}

/**
 * Find replacement sitters: nearby, approved, same service type, ranked by rating.
 * Shared between triggerReservationProtection and GET /bookings/:id/protection.
 */
export async function findReplacementSitters(
  excludeSitterId: number,
  serviceType: string,
  lat: number,
  lng: number,
  limit = 5
): Promise<{ id: number; name: string; slug: string; avatar_url: string | null; price_cents: number; avg_rating: number | null; review_count: number }[]> {
  const rows = await sql`
    SELECT u.id, u.name, u.slug, u.avatar_url,
           s.price_cents,
           (SELECT ROUND(AVG(rating)::numeric, 1)::float FROM reviews WHERE reviewee_id = u.id AND hidden_at IS NULL AND published_at IS NOT NULL) as avg_rating,
           (SELECT count(*)::int FROM reviews WHERE reviewee_id = u.id AND hidden_at IS NULL AND published_at IS NOT NULL) as review_count
    FROM users u
    JOIN services s ON s.sitter_id = u.id AND s.type = ${serviceType}
    WHERE u.id != ${excludeSitterId}
      AND u.roles @> '{sitter}'::text[]
      AND u.approval_status = 'approved'
      AND u.lat IS NOT NULL AND u.lng IS NOT NULL
      AND ST_DWithin(
        ST_MakePoint(u.lng, u.lat)::geography,
        ST_MakePoint(${lng}, ${lat})::geography,
        ${REPLACEMENT_SEARCH_RADIUS_METERS}
      )
    ORDER BY avg_rating DESC NULLS LAST
    LIMIT ${limit}
  `.catch(() => [] as any[]);
  return rows as any[];
}
