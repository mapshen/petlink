import type { Router } from 'express';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { requireSitterRole } from '../analytics.ts';
import { computeBookingInsights, computeProfileCompleteness, type InsightInput } from '../booking-insights.ts';
import { isNewSitter } from '../sitter-ranking.ts';
import logger, { sanitizeError } from '../logger.ts';

interface ProfileRow {
  has_avatar: boolean;
  has_bio: boolean;
  has_location: boolean;
  accepted_species: string[] | null;
  approved_at: string | null;
}

async function fetchProfileData(sitterId: number) {
  const [userRows, [serviceStat], [availStat], [photoStat], [verification]] = await Promise.all([
    sql`
      SELECT
        avatar_url IS NOT NULL AND avatar_url != '' AS has_avatar,
        bio IS NOT NULL AND bio != '' AS has_bio,
        location IS NOT NULL AS has_location,
        accepted_species,
        approved_at
      FROM users WHERE id = ${sitterId}
    `,
    sql`SELECT COUNT(*)::int AS count FROM services WHERE user_id = ${sitterId}`,
    sql`SELECT COUNT(*)::int AS count FROM availability WHERE sitter_id = ${sitterId} AND end_time > NOW()`,
    sql`SELECT COUNT(*)::int AS count FROM sitter_photos WHERE sitter_id = ${sitterId}`,
    sql`SELECT background_check_status FROM verifications WHERE sitter_id = ${sitterId}`,
  ]);

  const user = userRows[0] as ProfileRow | undefined;

  return {
    has_avatar: user?.has_avatar ?? false,
    has_bio: user?.has_bio ?? false,
    service_count: (serviceStat?.count as number) ?? 0,
    has_availability: ((availStat?.count as number) ?? 0) > 0,
    has_background_check: verification?.background_check_status === 'passed',
    photo_count: (photoStat?.count as number) ?? 0,
    has_location: user?.has_location ?? false,
    accepted_species: user?.accepted_species ?? null,
    approved_at: user?.approved_at ?? null,
  };
}

async function fetchPricingData(sitterId: number) {
  const rows = await sql`
    WITH sitter_services AS (
      SELECT type, price_cents FROM services WHERE user_id = ${sitterId}
    ),
    sitter_location AS (
      SELECT location FROM users WHERE id = ${sitterId} AND location IS NOT NULL
    ),
    local_avgs AS (
      SELECT
        s.type,
        AVG(s.price_cents)::int AS local_avg_cents
      FROM services s
      JOIN users u ON u.id = s.user_id
      CROSS JOIN sitter_location sl
      WHERE u.id != ${sitterId}
        AND u.approval_status = 'approved'
        AND u.location IS NOT NULL
        AND ST_DWithin(u.location, sl.location, 32186)
      GROUP BY s.type
    )
    SELECT
      ss.type AS service_type,
      ss.price_cents AS sitter_avg_cents,
      la.local_avg_cents
    FROM sitter_services ss
    LEFT JOIN local_avgs la ON la.type = ss.type
  `;
  return rows.map((r: { service_type: string; sitter_avg_cents: number | null; local_avg_cents: number | null }) => ({
    service_type: r.service_type,
    sitter_avg_cents: r.sitter_avg_cents,
    local_avg_cents: r.local_avg_cents,
  }));
}

async function fetchResponseData(sitterId: number) {
  const [sitterResp] = await sql`
    SELECT
      AVG(EXTRACT(EPOCH FROM (responded_at - created_at)) / 3600)::float AS avg_response_hours
    FROM bookings
    WHERE sitter_id = ${sitterId} AND responded_at IS NOT NULL
  `;

  const [platformResp] = await sql`
    SELECT
      AVG(EXTRACT(EPOCH FROM (responded_at - created_at)) / 3600)::float AS avg_response_hours
    FROM bookings
    WHERE responded_at IS NOT NULL
  `;

  return {
    avg_response_hours: sitterResp?.avg_response_hours
      ? Math.round(sitterResp.avg_response_hours * 10) / 10
      : null,
    platform_avg_response_hours: platformResp?.avg_response_hours
      ? Math.round(platformResp.avg_response_hours * 10) / 10
      : 3,
  };
}

async function fetchAvailabilityData(sitterId: number) {
  const [result] = await sql`
    SELECT COUNT(*)::int AS slots
    FROM availability
    WHERE sitter_id = ${sitterId}
      AND start_time >= NOW()
      AND start_time < NOW() + INTERVAL '14 days'
  `;
  return { slots_next_14_days: result?.slots ?? 0 };
}

async function fetchReviewData(sitterId: number) {
  const [sitterReviews] = await sql`
    SELECT
      AVG(rating)::float AS avg_rating,
      COUNT(*)::int AS review_count
    FROM reviews
    WHERE reviewee_id = ${sitterId}
  `;

  const [platformReviews] = await sql`
    SELECT AVG(rating)::float AS avg_rating
    FROM reviews
  `;

  return {
    avg_rating: sitterReviews?.avg_rating
      ? Math.round(sitterReviews.avg_rating * 10) / 10
      : null,
    review_count: sitterReviews?.review_count ?? 0,
    platform_avg_rating: platformReviews?.avg_rating
      ? Math.round(platformReviews.avg_rating * 10) / 10
      : 4.5,
  };
}

async function fetchVisibilityData(sitterId: number, profileCompletenessPct: number, approvedAt: string | null) {
  const [sub] = await sql`
    SELECT subscription_tier FROM users WHERE id = ${sitterId}
  `;

  const [strikes] = await sql`
    SELECT COALESCE(SUM(strike_weight), 0)::float AS total
    FROM sitter_strikes
    WHERE sitter_id = ${sitterId}
      AND expires_at > NOW()
  `;

  return {
    subscription_tier: sub?.subscription_tier ?? 'free',
    is_new_sitter: isNewSitter(approvedAt),
    profile_completeness_pct: profileCompletenessPct,
    active_strike_weight: strikes?.total ?? 0,
  };
}

async function fetchBookingTrend(sitterId: number) {
  const [thisMonth] = await sql`
    SELECT COUNT(*)::int AS count
    FROM bookings
    WHERE sitter_id = ${sitterId}
      AND start_time >= DATE_TRUNC('month', NOW())
  `;

  const [lastMonth] = await sql`
    SELECT COUNT(*)::int AS count
    FROM bookings
    WHERE sitter_id = ${sitterId}
      AND start_time >= DATE_TRUNC('month', NOW()) - INTERVAL '1 month'
      AND start_time < DATE_TRUNC('month', NOW())
  `;

  return {
    bookings_this_month: thisMonth?.count ?? 0,
    bookings_last_month: lastMonth?.count ?? 0,
  };
}

export default function insightRoutes(router: Router): void {
  router.get('/insights/me', authMiddleware, requireSitterRole, async (req: AuthenticatedRequest, res) => {
    try {
      const sitterId = req.userId!;

      const [profileData, pricingData, responseData, availabilityData, reviewData, trendData] = await Promise.all([
        fetchProfileData(sitterId),
        fetchPricingData(sitterId),
        fetchResponseData(sitterId),
        fetchAvailabilityData(sitterId),
        fetchReviewData(sitterId),
        fetchBookingTrend(sitterId),
      ]);

      const { approved_at, ...profile } = profileData;

      const profilePct = computeProfileCompleteness(profile);
      const visibilityData = await fetchVisibilityData(sitterId, profilePct, approved_at);

      const input: InsightInput = {
        profile,
        pricing: pricingData,
        response: responseData,
        availability: availabilityData,
        reviews: reviewData,
        visibility: visibilityData,
        trend: trendData,
      };

      const insights = computeBookingInsights(input);
      res.json(insights);
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch booking insights');
      res.status(500).json({ error: 'Failed to fetch booking insights' });
    }
  });
}
