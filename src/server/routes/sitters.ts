import type { Router } from 'express';
import type { RateLimitRequestHandler } from 'express-rate-limit';
import sql from '../db.ts';
import { validate, sitterSearchSchema, profileViewSchema } from '../validation.ts';
import { botBlockMiddleware, requireUserAgent } from '../bot-detection.ts';
import { verifyTurnstile } from '../turnstile.ts';
import { calculateRankingScore, isNewSitter, type SitterStats } from '../sitter-ranking.ts';
import { recordProfileView } from '../profile-views.ts';
import { dollarsToCents } from '../../lib/money.ts';
import { resolveActiveBadges, BADGE_CATALOG } from '../../shared/badge-catalog.ts';

export default function sitterRoutes(router: Router, publicLimiter: RateLimitRequestHandler): void {
  router.get('/sitters', requireUserAgent, botBlockMiddleware, publicLimiter, verifyTurnstile, async (req, res) => {
    const parsed = sitterSearchSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { serviceType, lat, lng, radius, minPrice, maxPrice, petSize, species, badges: badgesParam, cancellationPolicy, responseTime, availableThisWeek, limit: limitParam, offset: offsetParam } = parsed.data;
    const limit = Math.min(limitParam || 50, 100);
    const offset = offsetParam || 0;

    const hasGeo = lat != null && lng != null && radius != null;
    const geoPoint = hasGeo ? sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography` : sql``;
    const badgeFilters = badgesParam ? badgesParam.split(',').filter((b: string) => BADGE_CATALOG.some((d) => d.slug === b)) : [];

    const sitters = await sql`
      SELECT DISTINCT ON (u.id)
             u.id, u.name, u.roles, u.bio, u.avatar_url, u.slug,
             ROUND(u.lat::numeric, 2)::float as lat, ROUND(u.lng::numeric, 2)::float as lng,
             u.accepted_pet_sizes, u.accepted_species, u.years_experience, u.skills, u.created_at, u.approved_at, u.subscription_tier, u.founding_sitter,
             u.has_fenced_yard, u.non_smoking_home, u.has_insurance, u.one_client_at_a_time, u.has_own_pets, u.lifestyle_badges,
             u.cancellation_policy,
             s.price_cents, s.type as service_type, s.max_pets
             ${species ? sql`, sp.years_experience as species_years_experience, sp.accepted_pet_sizes as species_pet_sizes, sp.skills as species_skills` : sql``}
             ${hasGeo ? sql`, ST_Distance(u.location, ${geoPoint}) as distance_meters` : sql``}
      FROM users u
      JOIN services s ON u.id = s.sitter_id
      ${species ? sql`LEFT JOIN sitter_species_profiles sp ON u.id = sp.sitter_id AND sp.species = ${species}` : sql``}
      WHERE u.roles @> '{sitter}'::text[]
        AND u.approval_status = 'approved'
        ${serviceType ? sql`AND s.type = ${serviceType}` : sql``}
        ${minPrice != null ? sql`AND s.price_cents >= ${dollarsToCents(minPrice)}` : sql``}
        ${maxPrice != null ? sql`AND s.price_cents <= ${dollarsToCents(maxPrice)}` : sql``}
        ${petSize ? sql`AND ${petSize} = ANY(u.accepted_pet_sizes)` : sql``}
        ${species ? sql`AND ${species} = ANY(u.accepted_species) AND (s.species = ${species} OR s.species IS NULL)` : sql``}
        ${cancellationPolicy ? sql`AND u.cancellation_policy = ${cancellationPolicy}` : sql``}
        ${hasGeo ? sql`AND ST_DWithin(u.location, ${geoPoint}, ${radius})` : sql``}
      ORDER BY u.id, s.price_cents ASC
    `;

    // Compute ranking scores for each sitter
    const sitterIds = sitters.map((s: { id: number }) => s.id);
    const statsMap = new Map<number, Record<string, any>>();

    if (sitterIds.length > 0) {
      const stats = await sql`
        WITH booking_stats AS (
          SELECT
            b.sitter_id,
            COUNT(*) FILTER (WHERE b.status = 'completed')::int as completed,
            COUNT(*)::int as total,
            AVG(EXTRACT(EPOCH FROM (b.responded_at - b.created_at)) / 3600) FILTER (WHERE b.responded_at IS NOT NULL)::float as avg_response_hours,
            COUNT(DISTINCT b.owner_id) FILTER (WHERE b.status = 'completed')::int as unique_owners
          FROM bookings b
          LEFT JOIN services svc ON b.service_id = svc.id
          WHERE b.sitter_id = ANY(${sitterIds})
            AND (svc.type IS NULL OR svc.type != 'meet_greet')
          GROUP BY b.sitter_id
        ),
        repeat_owners AS (
          SELECT b.sitter_id, COUNT(DISTINCT b.owner_id)::int as repeat_count
          FROM bookings b
          LEFT JOIN services svc ON b.service_id = svc.id
          WHERE b.sitter_id = ANY(${sitterIds})
            AND b.status = 'completed'
            AND (svc.type IS NULL OR svc.type != 'meet_greet')
          GROUP BY b.sitter_id, b.owner_id
          HAVING COUNT(*) > 1
        )
        SELECT
          u.id as sitter_id,
          COALESCE(rv.avg_rating, 0) as avg_rating,
          COALESCE(rv.review_count, 0)::int as review_count,
          COALESCE(bk.completed, 0)::int as completed,
          COALESCE(bk.total, 0)::int as total,
          COALESCE(bk.avg_response_hours, 0)::float as avg_response_hours,
          COALESCE(ro.repeat_count, 0)::int as repeat_owners,
          COALESCE(bk.unique_owners, 0)::int as unique_owners,
          COALESCE(sc.service_count, 0)::int as service_count,
          COALESCE(av.has_avail, false) as has_availability
        FROM users u
        LEFT JOIN LATERAL (
          SELECT AVG(r.rating)::float as avg_rating, COUNT(*)::int as review_count
          FROM reviews r
          JOIN bookings rb ON r.booking_id = rb.id
          LEFT JOIN services rsvc ON rb.service_id = rsvc.id
          WHERE r.reviewee_id = u.id
            AND r.hidden_at IS NULL
            AND (r.published_at IS NOT NULL OR r.created_at < NOW() - INTERVAL '3 days')
            AND (rsvc.type IS NULL OR rsvc.type != 'meet_greet')
        ) rv ON true
        LEFT JOIN booking_stats bk ON bk.sitter_id = u.id
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int as repeat_count
          FROM repeat_owners ro2 WHERE ro2.sitter_id = u.id
        ) ro ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int as service_count FROM services sv WHERE sv.sitter_id = u.id
        ) sc ON true
        LEFT JOIN LATERAL (
          SELECT EXISTS(
            SELECT 1 FROM availability a
            WHERE a.sitter_id = u.id
              AND (
                (a.recurring = true AND a.day_of_week IN (
                  EXTRACT(DOW FROM CURRENT_DATE)::int,
                  EXTRACT(DOW FROM CURRENT_DATE + INTERVAL '1 day')::int,
                  EXTRACT(DOW FROM CURRENT_DATE + INTERVAL '2 days')::int,
                  EXTRACT(DOW FROM CURRENT_DATE + INTERVAL '3 days')::int,
                  EXTRACT(DOW FROM CURRENT_DATE + INTERVAL '4 days')::int,
                  EXTRACT(DOW FROM CURRENT_DATE + INTERVAL '5 days')::int,
                  EXTRACT(DOW FROM CURRENT_DATE + INTERVAL '6 days')::int
                ))
                OR (a.specific_date IS NOT NULL AND a.specific_date >= CURRENT_DATE AND a.specific_date < CURRENT_DATE + INTERVAL '7 days')
              )
          ) as has_avail
        ) av ON true
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(strike_weight), 0)::float as active_strike_weight
          FROM sitter_strikes st WHERE st.sitter_id = u.id AND st.expires_at > NOW()
        ) sr ON true
        WHERE u.id = ANY(${sitterIds})
      `;
      for (const s of stats) {
        statsMap.set(s.sitter_id, s);
      }
    }

    const ranked = sitters.map((sitter: any) => {
      const s = statsMap.get(sitter.id);
      const sitterStats: SitterStats = {
        avg_rating: s?.avg_rating || null,
        review_count: s?.review_count || 0,
        completed_bookings: s?.completed || 0,
        total_bookings: s?.total || 0,
        avg_response_hours: s?.avg_response_hours ?? null,
        repeat_owner_count: s?.repeat_owners || 0,
        unique_owner_count: s?.unique_owners || 0,
        has_avatar: Boolean(sitter.avatar_url),
        has_bio: Boolean(sitter.bio),
        service_count: s?.service_count || 0,
        has_availability: Boolean(s?.has_availability),
        approved_at: sitter.approved_at,
        distance_meters: sitter.distance_meters,
        subscription_tier: sitter.subscription_tier,
        active_strike_weight: s?.active_strike_weight || 0,
      };
      const totalBookings = s?.total || 0;
      return {
        ...sitter,
        ranking_score: calculateRankingScore(sitterStats),
        is_new: isNewSitter(sitter.approved_at),
        review_count: s?.review_count || 0,
        avg_rating: s?.avg_rating ? Number(s.avg_rating.toFixed(1)) : null,
        avg_response_hours: s?.avg_response_hours ?? null,
        repeat_client_count: s?.repeat_owners || 0,
        completion_rate: totalBookings > 0 ? (s?.completed || 0) / totalBookings : null,
        member_since: sitter.created_at,
        has_availability: Boolean(s?.has_availability),
      };
    });

    ranked.sort((a: any, b: any) => b.ranking_score - a.ranking_score);

    // Post-query filters (applied after ranking since they depend on computed stats)
    let filtered = ranked;
    if (responseTime != null) {
      filtered = filtered.filter((s: any) => s.avg_response_hours != null && s.avg_response_hours <= responseTime);
    }
    if (availableThisWeek) {
      filtered = filtered.filter((s: any) => s.has_availability);
    }

    // When species filter is active, prefer species-specific data over global user fields
    const withSpecies = species
      ? filtered.map(({ species_years_experience, species_pet_sizes, species_skills, ...rest }: any) => ({
          ...rest,
          years_experience: species_years_experience ?? rest.years_experience,
          accepted_pet_sizes: species_pet_sizes?.length > 0 ? species_pet_sizes : rest.accepted_pet_sizes,
          skills: species_skills?.length > 0 ? species_skills : rest.skills,
        }))
      : filtered;

    // Resolve active badges for each sitter and apply badge filters
    const withBadges = withSpecies.map((s: any) => ({
      ...s,
      active_badges: resolveActiveBadges(s),
    }));

    const results = badgeFilters.length > 0
      ? withBadges.filter((s: any) => badgeFilters.every((b: string) => s.active_badges.includes(b)))
      : withBadges;

    const total = results.length;
    const paginated = results.slice(offset, offset + limit);

    // Batch-fetch addon slugs for returned sitters
    const pageIds = paginated.map((s: any) => s.id);
    const addonMap = new Map<number, string[]>();
    if (pageIds.length > 0) {
      const rows = await sql`SELECT sitter_id, addon_slug FROM sitter_addons WHERE sitter_id = ANY(${pageIds}) ORDER BY created_at`;
      for (const r of rows) {
        const slugs = addonMap.get(r.sitter_id) ?? [];
        slugs.push(r.addon_slug);
        addonMap.set(r.sitter_id, slugs);
      }
    }
    const withAddons = paginated.map((s: any) => ({
      ...s,
      addon_slugs: addonMap.get(s.id) ?? [],
      lifestyle_badges: s.active_badges,
    }));

    res.json({ sitters: withAddons, total, limit, offset });
  });

  router.get('/sitters/:idOrSlug', requireUserAgent, botBlockMiddleware, publicLimiter, verifyTurnstile, async (req, res) => {
    const param = req.params.idOrSlug;
    const isNumeric = /^\d+$/.test(param);
    const [sitter] = await sql`
      SELECT id, name, roles, bio, avatar_url, slug, ROUND(lat::numeric, 2)::float as lat, ROUND(lng::numeric, 2)::float as lng, accepted_pet_sizes, accepted_species, cancellation_policy, years_experience, home_type, has_yard, has_fenced_yard, has_own_pets, own_pets_description, skills, service_radius_miles, max_pets_at_once, max_pets_per_walk, house_rules, emergency_procedures, has_insurance, subscription_tier, founding_sitter, non_smoking_home, one_client_at_a_time, lifestyle_badges, camera_preference, created_at FROM users
      WHERE ${isNumeric ? sql`id = ${Number(param)}` : sql`slug = ${param}`}
        AND roles @> '{sitter}'::text[] AND approval_status = 'approved'
    `;
    if (!sitter) {
      res.status(404).json({ error: 'Sitter not found' });
      return;
    }

    const sitterId = sitter.id;
    const services = await sql`SELECT * FROM services WHERE sitter_id = ${sitterId}`;
    const addons = await sql`SELECT id, addon_slug, price_cents, notes FROM sitter_addons WHERE sitter_id = ${sitterId} ORDER BY created_at`;
    const photos = await sql`SELECT * FROM sitter_photos WHERE sitter_id = ${sitterId} ORDER BY sort_order, created_at`;

    // Public review stats (not gated behind auth) — excludes hidden reviews
    const [reviewStats] = await sql`
      SELECT
        AVG(r.rating)::float as avg_rating,
        COUNT(*)::int as review_count
      FROM reviews r
      JOIN bookings rb ON r.booking_id = rb.id
      LEFT JOIN services rsvc ON rb.service_id = rsvc.id
      WHERE r.reviewee_id = ${sitterId}
        AND r.hidden_at IS NULL
        AND (r.published_at IS NOT NULL OR r.created_at < NOW() - INTERVAL '3 days')
        AND (rsvc.type IS NULL OR rsvc.type != 'meet_greet')
    `;

    // Reviews only returned for authenticated users — excludes hidden reviews
    const authHeader = req.headers.authorization;
    let reviews: any[] = [];
    if (authHeader?.startsWith('Bearer ')) {
      const rawReviews = await sql`
        SELECT r.*, u.name as reviewer_name, u.avatar_url as reviewer_avatar
        FROM reviews r
        JOIN users u ON r.reviewer_id = u.id
        WHERE r.reviewee_id = ${sitterId}
          AND r.hidden_at IS NULL
          AND (r.published_at IS NOT NULL OR r.created_at < NOW() - INTERVAL '3 days')
        ORDER BY r.created_at DESC
      `;
      // Strip private_flags and private_note from public responses
      reviews = rawReviews.map((r: { private_flags?: string[]; private_note?: string | null }) => {
        const { private_flags: _pf, private_note: _pn, ...rest } = r;
        return rest;
      });
    }

    const imported_reviews = await sql`
      SELECT ir.id, ir.platform, ir.reviewer_name, ir.rating, ir.comment, ir.review_date
      FROM imported_reviews ir
      JOIN imported_profiles ip ON ir.imported_profile_id = ip.id
      WHERE ir.sitter_id = ${sitterId} AND ip.verification_status = 'verified'
      ORDER BY ir.review_date DESC NULLS LAST
    `;

    // Trust stats for profile (response time, repeat clients, completion rate)
    const [trustStats] = await sql`
      WITH booking_stats AS (
        SELECT
          COUNT(*) FILTER (WHERE b.status = 'completed')::int as completed,
          COUNT(*)::int as total,
          AVG(EXTRACT(EPOCH FROM (b.responded_at - b.created_at)) / 3600) FILTER (WHERE b.responded_at IS NOT NULL)::float as avg_response_hours
        FROM bookings b
        LEFT JOIN services svc ON b.service_id = svc.id
        WHERE b.sitter_id = ${sitterId}
          AND (svc.type IS NULL OR svc.type != 'meet_greet')
      ),
      repeat_owners AS (
        SELECT COUNT(*)::int as repeat_count
        FROM (
          SELECT b.owner_id
          FROM bookings b
          LEFT JOIN services svc ON b.service_id = svc.id
          WHERE b.sitter_id = ${sitterId}
            AND b.status = 'completed'
            AND (svc.type IS NULL OR svc.type != 'meet_greet')
          GROUP BY b.owner_id
          HAVING COUNT(*) > 1
        ) rpt
      )
      SELECT
        COALESCE(bs.completed, 0)::int as completed,
        COALESCE(bs.total, 0)::int as total,
        bs.avg_response_hours,
        COALESCE(ro.repeat_count, 0)::int as repeat_owners
      FROM booking_stats bs, repeat_owners ro
    `;

    const totalBookings = trustStats?.total || 0;
    const sitterWithStats = {
      ...sitter,
      avg_rating: reviewStats.avg_rating ? Number(reviewStats.avg_rating.toFixed(1)) : null,
      review_count: reviewStats.review_count,
      active_badges: resolveActiveBadges(sitter),
      avg_response_hours: trustStats?.avg_response_hours ?? null,
      repeat_client_count: trustStats?.repeat_owners || 0,
      completion_rate: totalBookings > 0 ? (trustStats?.completed || 0) / totalBookings : null,
      member_since: sitter.created_at,
    };

    const profileMembers = await sql`
      SELECT id, name, avatar_url, role,
        CASE WHEN background_check_status = 'passed' THEN true ELSE false END AS background_check_passed
      FROM profile_members WHERE sitter_id = ${sitterId} ORDER BY created_at
    `;

    res.json({ sitter: sitterWithStats, services, addons, reviews, photos, imported_reviews, profile_members: profileMembers });
  });

  // --- Profile View Tracking (Issue #165) ---
  router.post('/sitters/:id/view', requireUserAgent, botBlockMiddleware, publicLimiter, validate(profileViewSchema), async (req, res) => {
    const sitterId = Number(req.params.id);
    if (!sitterId || isNaN(sitterId)) {
      res.status(400).json({ error: 'Invalid sitter ID' });
      return;
    }
    const { source, session_id } = req.body;
    // Fire-and-forget: respond immediately, insert async
    res.status(204).end();
    recordProfileView(sitterId, source, session_id).catch(() => {});
  });
}
