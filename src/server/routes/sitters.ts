import type { Router } from 'express';
import type { RateLimitRequestHandler } from 'express-rate-limit';
import sql from '../db.ts';
import { validate, sitterSearchSchema, profileViewSchema } from '../validation.ts';
import { botBlockMiddleware, requireUserAgent } from '../bot-detection.ts';
import { calculateRankingScore, isNewSitter, type SitterStats } from '../sitter-ranking.ts';
import { recordProfileView } from '../profile-views.ts';
import { dollarsToCents } from '../../lib/money.ts';

export default function sitterRoutes(router: Router, publicLimiter: RateLimitRequestHandler): void {
  router.get('/sitters', requireUserAgent, botBlockMiddleware, publicLimiter, async (req, res) => {
    const parsed = sitterSearchSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0].message });
      return;
    }
    const { serviceType, lat, lng, radius, minPrice, maxPrice, petSize, species, limit: limitParam, offset: offsetParam } = parsed.data;
    const limit = Math.min(limitParam || 50, 100);
    const offset = offsetParam || 0;

    const hasGeo = lat != null && lng != null && radius != null;
    const geoPoint = hasGeo ? sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography` : sql``;

    const sitters = await sql`
      SELECT DISTINCT ON (u.id)
             u.id, u.name, u.roles, u.bio, u.avatar_url, u.slug,
             ROUND(u.lat::numeric, 2)::float as lat, ROUND(u.lng::numeric, 2)::float as lng,
             u.accepted_pet_sizes, u.accepted_species, u.years_experience, u.skills, u.created_at, u.approved_at,
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
            COUNT(DISTINCT b.owner_id) FILTER (WHERE b.status = 'completed')::int as unique_owners,
            COUNT(DISTINCT CASE
              WHEN b.status = 'completed' AND (
                SELECT COUNT(*) FROM bookings b2
                WHERE b2.sitter_id = b.sitter_id AND b2.owner_id = b.owner_id AND b2.status = 'completed'
              ) > 1 THEN b.owner_id
            END)::int as repeat_owners
          FROM bookings b
          LEFT JOIN services svc ON b.service_id = svc.id
          WHERE b.sitter_id = ANY(${sitterIds})
            AND (svc.type IS NULL OR svc.type != 'meet_greet')
          GROUP BY b.sitter_id
        )
        SELECT
          u.id as sitter_id,
          COALESCE(rv.avg_rating, 0) as avg_rating,
          COALESCE(rv.review_count, 0)::int as review_count,
          COALESCE(bk.completed, 0)::int as completed,
          COALESCE(bk.total, 0)::int as total,
          COALESCE(bk.avg_response_hours, 0)::float as avg_response_hours,
          COALESCE(bk.repeat_owners, 0)::int as repeat_owners,
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
            AND (r.published_at IS NOT NULL OR r.created_at < NOW() - INTERVAL '3 days')
            AND (rsvc.type IS NULL OR rsvc.type != 'meet_greet')
        ) rv ON true
        LEFT JOIN booking_stats bk ON bk.sitter_id = u.id
        LEFT JOIN LATERAL (
          SELECT COUNT(*)::int as service_count FROM services sv WHERE sv.sitter_id = u.id
        ) sc ON true
        LEFT JOIN LATERAL (
          SELECT EXISTS(SELECT 1 FROM availability a WHERE a.sitter_id = u.id) as has_avail
        ) av ON true
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
        avg_response_hours: s?.avg_response_hours || null,
        repeat_owner_count: s?.repeat_owners || 0,
        unique_owner_count: s?.unique_owners || 0,
        has_avatar: Boolean(sitter.avatar_url),
        has_bio: Boolean(sitter.bio),
        service_count: s?.service_count || 0,
        has_availability: Boolean(s?.has_availability),
        approved_at: sitter.approved_at,
        distance_meters: sitter.distance_meters,
      };
      return {
        ...sitter,
        ranking_score: calculateRankingScore(sitterStats),
        is_new: isNewSitter(sitter.approved_at),
        review_count: s?.review_count || 0,
        avg_rating: s?.avg_rating ? Number(s.avg_rating.toFixed(1)) : null,
      };
    });

    ranked.sort((a: any, b: any) => b.ranking_score - a.ranking_score);

    // When species filter is active, prefer species-specific data over global user fields
    const results = species
      ? ranked.map(({ species_years_experience, species_pet_sizes, species_skills, ...rest }: any) => ({
          ...rest,
          years_experience: species_years_experience ?? rest.years_experience,
          accepted_pet_sizes: species_pet_sizes?.length > 0 ? species_pet_sizes : rest.accepted_pet_sizes,
          skills: species_skills?.length > 0 ? species_skills : rest.skills,
        }))
      : ranked;

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
    const withAddons = paginated.map((s: any) => ({ ...s, addon_slugs: addonMap.get(s.id) ?? [] }));

    res.json({ sitters: withAddons, total, limit, offset });
  });

  router.get('/sitters/:idOrSlug', requireUserAgent, botBlockMiddleware, publicLimiter, async (req, res) => {
    const param = req.params.idOrSlug;
    const isNumeric = /^\d+$/.test(param);
    const [sitter] = await sql`
      SELECT id, name, roles, bio, avatar_url, slug, ROUND(lat::numeric, 2)::float as lat, ROUND(lng::numeric, 2)::float as lng, accepted_pet_sizes, accepted_species, cancellation_policy, years_experience, home_type, has_yard, has_fenced_yard, has_own_pets, own_pets_description, skills, service_radius_miles, max_pets_at_once, max_pets_per_walk, house_rules, emergency_procedures, has_insurance, subscription_tier FROM users
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

    // Public review stats (not gated behind auth)
    const [reviewStats] = await sql`
      SELECT
        AVG(r.rating)::float as avg_rating,
        COUNT(*)::int as review_count
      FROM reviews r
      JOIN bookings rb ON r.booking_id = rb.id
      LEFT JOIN services rsvc ON rb.service_id = rsvc.id
      WHERE r.reviewee_id = ${sitterId}
        AND (r.published_at IS NOT NULL OR r.created_at < NOW() - INTERVAL '3 days')
        AND (rsvc.type IS NULL OR rsvc.type != 'meet_greet')
    `;

    // Reviews only returned for authenticated users
    const authHeader = req.headers.authorization;
    let reviews: any[] = [];
    if (authHeader?.startsWith('Bearer ')) {
      reviews = await sql`
        SELECT r.*, u.name as reviewer_name, u.avatar_url as reviewer_avatar
        FROM reviews r
        JOIN users u ON r.reviewer_id = u.id
        WHERE r.reviewee_id = ${sitterId} AND (r.published_at IS NOT NULL OR r.created_at < NOW() - INTERVAL '3 days')
        ORDER BY r.created_at DESC
      `;
    }

    const imported_reviews = await sql`
      SELECT ir.id, ir.platform, ir.reviewer_name, ir.rating, ir.comment, ir.review_date
      FROM imported_reviews ir
      JOIN imported_profiles ip ON ir.imported_profile_id = ip.id
      WHERE ir.sitter_id = ${sitterId} AND ip.verification_status = 'verified'
      ORDER BY ir.review_date DESC NULLS LAST
    `;

    const sitterWithStats = {
      ...sitter,
      avg_rating: reviewStats.avg_rating ? Number(reviewStats.avg_rating.toFixed(1)) : null,
      review_count: reviewStats.review_count,
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
