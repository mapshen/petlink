import sql from './db.ts';
import type { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './auth.ts';
import { getProfileViewsCount } from './profile-views.ts';

// --- Middleware ---

export async function requireSitterRole(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const [currentUser] = await sql`SELECT role FROM users WHERE id = ${req.userId}`;
  if (currentUser.role !== 'sitter' && currentUser.role !== 'both') {
    res.status(403).json({ error: 'Only sitters can access analytics' });
    return;
  }
  next();
}

// --- Helpers ---

const MIN_YEAR = 2020;

export function validateYear(raw: unknown): { valid: true; year: number } | { valid: false; error: string } {
  const year = Number(raw) || new Date().getFullYear();
  const maxYear = new Date().getFullYear() + 1;
  if (!Number.isInteger(year) || year < MIN_YEAR || year > maxYear) {
    return { valid: false, error: `Year must be between ${MIN_YEAR} and ${maxYear}` };
  }
  return { valid: true, year };
}

export function validateRevenuePeriod(raw: unknown): 'weekly' | 'monthly' {
  return raw === 'weekly' ? 'weekly' : 'monthly';
}

// --- Date Range Resolution ---

type DateRangeOption =
  | { year: number }
  | { startDate: string; endDate: string };

function resolveDateRange(option: DateRangeOption): { rangeStart: string; rangeEnd: string } {
  if ('startDate' in option) {
    return { rangeStart: option.startDate, rangeEnd: option.endDate };
  }
  return { rangeStart: `${option.year}-01-01`, rangeEnd: `${option.year + 1}-01-01` };
}

// --- Queries ---

export async function getOverview(sitterId: number, option: DateRangeOption) {
  const { rangeStart, rangeEnd } = resolveDateRange(option);

  const [bookingStats] = await sql`
    WITH sitter_bookings AS (
      SELECT * FROM bookings
      WHERE sitter_id = ${sitterId}
        AND start_time >= ${rangeStart}::timestamptz
        AND start_time < ${rangeEnd}::timestamptz
    ),
    repeat AS (
      SELECT owner_id
      FROM sitter_bookings
      WHERE status = 'completed'
      GROUP BY owner_id
      HAVING COUNT(*) > 1
    )
    SELECT
      COUNT(*)::int AS total_bookings,
      COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_bookings,
      COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_bookings,
      COALESCE(SUM(total_price) FILTER (WHERE status = 'completed'), 0)::float AS total_revenue,
      COUNT(DISTINCT owner_id)::int AS unique_clients,
      COUNT(DISTINCT owner_id) FILTER (
        WHERE owner_id IN (SELECT owner_id FROM repeat)
      )::int AS repeat_clients
    FROM sitter_bookings
  `;

  const [reviewStats] = await sql`
    SELECT
      AVG(r.rating)::float AS avg_rating,
      COUNT(*)::int AS review_count
    FROM reviews r
    JOIN bookings b ON b.id = r.booking_id
    WHERE r.reviewee_id = ${sitterId}
      AND b.start_time >= ${rangeStart}::timestamptz
      AND b.start_time < ${rangeEnd}::timestamptz
  `;

  const [responseStats] = await sql`
    SELECT
      AVG(EXTRACT(EPOCH FROM (responded_at - created_at)) / 3600)::float AS avg_response_hours
    FROM bookings
    WHERE sitter_id = ${sitterId}
      AND responded_at IS NOT NULL
      AND start_time >= ${rangeStart}::timestamptz
      AND start_time < ${rangeEnd}::timestamptz
  `;

  const monthlyRevenue = await sql`
    SELECT
      EXTRACT(MONTH FROM start_time)::int AS month,
      COALESCE(SUM(total_price), 0)::float AS revenue
    FROM bookings
    WHERE sitter_id = ${sitterId}
      AND status = 'completed'
      AND start_time >= ${rangeStart}::timestamptz
      AND start_time < ${rangeEnd}::timestamptz
    GROUP BY EXTRACT(MONTH FROM start_time)
    ORDER BY month
  `;

  const profileViews = await getProfileViewsCount(sitterId, rangeStart, rangeEnd);

  const totalBookings = bookingStats.total_bookings;
  const completedBookings = bookingStats.completed_bookings;
  const uniqueClients = bookingStats.unique_clients;
  const repeatClients = bookingStats.repeat_clients;

  return {
    total_bookings: totalBookings,
    completed_bookings: completedBookings,
    cancelled_bookings: bookingStats.cancelled_bookings,
    total_revenue: bookingStats.total_revenue,
    avg_rating: reviewStats.avg_rating ? Math.round(reviewStats.avg_rating * 10) / 10 : null,
    review_count: reviewStats.review_count,
    avg_response_hours: responseStats.avg_response_hours
      ? Math.round(responseStats.avg_response_hours * 10) / 10
      : null,
    completion_rate: totalBookings > 0 ? Math.round((completedBookings / totalBookings) * 100) : 0,
    cancellation_rate: totalBookings > 0 ? Math.round((bookingStats.cancelled_bookings / totalBookings) * 100) : 0,
    repeat_client_pct: uniqueClients > 0 ? Math.round((repeatClients / uniqueClients) * 100) : 0,
    unique_clients: uniqueClients,
    profile_views: profileViews,
    monthly_revenue: monthlyRevenue.map((r: { month: number; revenue: number }) => ({
      month: r.month,
      revenue: r.revenue,
    })),
  };
}

export async function getClients(sitterId: number, limit = 50, offset = 0, startDate?: string, endDate?: string) {
  const clients = await sql`
    SELECT
      u.id AS client_id,
      u.name AS client_name,
      u.avatar_url AS client_avatar,
      COUNT(b.id)::int AS total_bookings,
      COUNT(b.id) FILTER (WHERE b.status = 'completed')::int AS completed_bookings,
      COALESCE(SUM(b.total_price) FILTER (WHERE b.status = 'completed'), 0)::float AS total_spent,
      MIN(b.start_time) AS first_booking_date,
      MAX(b.start_time) AS last_booking_date
    FROM bookings b
    JOIN users u ON u.id = b.owner_id
    WHERE b.sitter_id = ${sitterId}
      ${startDate ? sql`AND b.start_time >= ${startDate}::timestamptz` : sql``}
      ${endDate ? sql`AND b.start_time < ${endDate}::timestamptz` : sql``}
    GROUP BY u.id, u.name, u.avatar_url
    ORDER BY MAX(b.start_time) DESC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const clientIds = clients.map((c: { client_id: number }) => c.client_id);
  const pets = clientIds.length > 0
    ? await sql`
      SELECT DISTINCT p.id, p.name, p.species, p.photo_url, p.owner_id
      FROM pets p
      WHERE p.owner_id = ANY(${clientIds})
    `
    : [];

  const petsList = pets as unknown as { id: number; name: string; species?: string; photo_url?: string; owner_id: number }[];
  const petsByOwner = petsList
    .reduce<Record<number, { id: number; name: string; species?: string; photo_url?: string }[]>>(
      (acc, pet) => ({
        ...acc,
        [pet.owner_id]: [
          ...(acc[pet.owner_id] ?? []),
          { id: pet.id, name: pet.name, species: pet.species, photo_url: pet.photo_url },
        ],
      }),
      {},
    );

  return clients.map((c: Record<string, unknown>) => ({
    ...c,
    pets: petsByOwner[(c as { client_id: number }).client_id] ?? [],
  }));
}

export async function getClientDetail(sitterId: number, clientId: number) {
  const [client] = await sql`SELECT id, name, avatar_url FROM users WHERE id = ${clientId}`;
  if (!client) {
    return null;
  }

  const bookings = await sql`
    SELECT
      b.id, b.status, s.type AS service_type, b.start_time, b.end_time,
      b.total_price, b.created_at
    FROM bookings b
    LEFT JOIN services s ON s.id = b.service_id
    WHERE b.sitter_id = ${sitterId} AND b.owner_id = ${clientId}
    ORDER BY b.start_time DESC
  `;

  if (bookings.length === 0) {
    return { client: { id: client.id, name: client.name, avatar_url: client.avatar_url }, bookings: [] };
  }

  const bookingIds = bookings.map((b: { id: number }) => b.id);
  const bookingPets = await sql`
    SELECT bp.booking_id, p.id, p.name
    FROM booking_pets bp
    JOIN pets p ON p.id = bp.pet_id
    WHERE bp.booking_id = ANY(${bookingIds})
  `;

  const bookingPetsList = bookingPets as unknown as { booking_id: number; id: number; name: string }[];
  const petsByBooking = bookingPetsList
    .reduce<Record<number, { id: number; name: string }[]>>(
      (acc, bp) => ({
        ...acc,
        [bp.booking_id]: [
          ...(acc[bp.booking_id] ?? []),
          { id: bp.id, name: bp.name },
        ],
      }),
      {},
    );

  return {
    client: { id: client.id, name: client.name, avatar_url: client.avatar_url },
    bookings: bookings.map((b: Record<string, unknown>) => ({
      ...b,
      pets: petsByBooking[(b as { id: number }).id] ?? [],
    })),
  };
}

export async function getRevenue(sitterId: number, period: 'weekly' | 'monthly', option: DateRangeOption) {
  const { rangeStart, rangeEnd } = resolveDateRange(option);

  const data = period === 'monthly'
    ? await sql`
      SELECT
        TO_CHAR(start_time, 'YYYY-MM') AS period,
        COALESCE(SUM(total_price), 0)::float AS revenue,
        COUNT(*)::int AS booking_count
      FROM bookings
      WHERE sitter_id = ${sitterId}
        AND status = 'completed'
        AND start_time >= ${rangeStart}::timestamptz
        AND start_time < ${rangeEnd}::timestamptz
      GROUP BY TO_CHAR(start_time, 'YYYY-MM')
      ORDER BY period
    `
    : await sql`
      SELECT
        TO_CHAR(DATE_TRUNC('week', start_time), 'YYYY-"W"IW') AS period,
        COALESCE(SUM(total_price), 0)::float AS revenue,
        COUNT(*)::int AS booking_count
      FROM bookings
      WHERE sitter_id = ${sitterId}
        AND status = 'completed'
        AND start_time >= ${rangeStart}::timestamptz
        AND start_time < ${rangeEnd}::timestamptz
      GROUP BY DATE_TRUNC('week', start_time)
      ORDER BY period
    `;

  return { period, data };
}
