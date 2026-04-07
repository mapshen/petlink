import sql from './db.ts';
import logger, { sanitizeError } from './logger.ts';

const BACKUP_SEARCH_RADIUS_METERS = 50_000; // 50km / ~31 miles
const DEFAULT_BACKUP_COUNT = 3;

export interface BackupSitter {
  id: number;
  name: string;
  slug: string;
  avatar_url: string | null;
  price_cents: number;
  avg_rating: number | null;
  review_count: number;
  distance_meters: number;
}

export interface BookingBackup {
  id: number;
  booking_id: number;
  sitter_id: number;
  rank: number;
  status: 'suggested' | 'accepted' | 'declined';
  created_at?: string;
  // Joined fields
  name?: string;
  slug?: string;
  avatar_url?: string | null;
  avg_rating?: number | null;
  review_count?: number;
  price_cents?: number;
}

/**
 * Find backup sitters: nearby, approved, same service type, ranked by
 * distance (ascending) then rating (descending).
 */
export async function findBackupSitters(
  excludeSitterId: number,
  serviceType: string,
  lat: number,
  lng: number,
  limit = DEFAULT_BACKUP_COUNT
): Promise<BackupSitter[]> {
  try {
    const rows = await sql`
      SELECT u.id, u.name, u.slug, u.avatar_url,
             s.price_cents,
             (SELECT ROUND(AVG(rating)::numeric, 1)::float
              FROM reviews
              WHERE reviewee_id = u.id AND hidden_at IS NULL AND published_at IS NOT NULL) as avg_rating,
             (SELECT count(*)::int
              FROM reviews
              WHERE reviewee_id = u.id AND hidden_at IS NULL AND published_at IS NOT NULL) as review_count,
             ST_Distance(
               ST_MakePoint(u.lng, u.lat)::geography,
               ST_MakePoint(${lng}, ${lat})::geography
             ) as distance_meters
      FROM users u
      JOIN services s ON s.sitter_id = u.id AND s.type = ${serviceType}
      WHERE u.id != ${excludeSitterId}
        AND u.roles @> '{sitter}'::text[]
        AND u.approval_status = 'approved'
        AND u.lat IS NOT NULL AND u.lng IS NOT NULL
        AND ST_DWithin(
          ST_MakePoint(u.lng, u.lat)::geography,
          ST_MakePoint(${lng}, ${lat})::geography,
          ${BACKUP_SEARCH_RADIUS_METERS}
        )
      ORDER BY distance_meters ASC, avg_rating DESC NULLS LAST
      LIMIT ${limit}
    `;
    return rows as unknown as BackupSitter[];
  } catch (err) {
    logger.error({ err: sanitizeError(err) }, 'Failed to find backup sitters');
    return [];
  }
}

/**
 * Generate backup sitter suggestions for a confirmed booking.
 * Clears any existing suggestions and creates fresh ones.
 */
export async function generateBackupsForBooking(
  bookingId: number
): Promise<BookingBackup[]> {
  try {
    // Look up booking
    const [booking] = await sql`
      SELECT id, sitter_id, owner_id, service_id, status, start_time
      FROM bookings WHERE id = ${bookingId}
    `;
    if (!booking) {
      logger.warn({ bookingId }, 'Booking not found for backup generation');
      return [];
    }

    if (booking.status !== 'confirmed') {
      logger.info({ bookingId, status: booking.status }, 'Skipping backup generation — booking not confirmed');
      return [];
    }

    // Look up service type
    const [service] = await sql`SELECT type FROM services WHERE id = ${booking.service_id}`;
    if (!service) return [];

    // Look up owner location
    const [owner] = await sql`SELECT lat, lng FROM users WHERE id = ${booking.owner_id}`;
    if (!owner?.lat || !owner?.lng) {
      logger.info({ bookingId }, 'Owner has no location — skipping backup generation');
      return [];
    }

    // Find backup sitters
    const sitters = await findBackupSitters(
      booking.sitter_id,
      service.type,
      owner.lat,
      owner.lng,
      DEFAULT_BACKUP_COUNT
    );

    if (sitters.length === 0) return [];

    // Clear existing backups
    await sql`DELETE FROM booking_backups WHERE booking_id = ${bookingId}`;

    // Insert new backups
    const backups: BookingBackup[] = [];
    for (let i = 0; i < sitters.length; i++) {
      const sitter = sitters[i];
      const [row] = await sql`
        INSERT INTO booking_backups (booking_id, sitter_id, rank, status)
        VALUES (${bookingId}, ${sitter.id}, ${i + 1}, 'suggested')
        ON CONFLICT (booking_id, sitter_id) DO UPDATE SET rank = ${i + 1}
        RETURNING *
      `;
      if (row) backups.push(row as unknown as BookingBackup);
    }

    logger.info({ bookingId, count: backups.length }, 'Generated backup sitters for booking');
    return backups;
  } catch (err) {
    logger.error({ err: sanitizeError(err), bookingId }, 'Failed to generate backup sitters');
    return [];
  }
}

/**
 * Retrieve backup sitter suggestions for a booking, enriched with user info.
 */
export async function getBackupsForBooking(
  bookingId: number
): Promise<BookingBackup[]> {
  const rows = await sql`
    SELECT bb.id, bb.booking_id, bb.sitter_id, bb.rank, bb.status, bb.created_at,
           u.name, u.slug, u.avatar_url,
           (SELECT ROUND(AVG(rating)::numeric, 1)::float
            FROM reviews
            WHERE reviewee_id = u.id AND hidden_at IS NULL AND published_at IS NOT NULL) as avg_rating,
           (SELECT count(*)::int
            FROM reviews
            WHERE reviewee_id = u.id AND hidden_at IS NULL AND published_at IS NOT NULL) as review_count,
           s.price_cents
    FROM booking_backups bb
    JOIN users u ON u.id = bb.sitter_id
    LEFT JOIN services s ON s.sitter_id = u.id
    WHERE bb.booking_id = ${bookingId}
    ORDER BY bb.rank ASC
  `;
  return rows as unknown as BookingBackup[];
}
