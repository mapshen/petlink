import type { Router } from 'express';
import sql from '../db.ts';
import {
  authMiddleware,
  revokeAllUserTokens,
  type AuthenticatedRequest,
} from '../auth.ts';
import { validate, updateProfileSchema } from '../validation.ts';
import { isAdminUser } from '../admin.ts';
import logger, { sanitizeError } from '../logger.ts';

const OWNER_PROFILE_REVIEW_LIMIT = 50;

export default function userRoutes(router: Router): void {
  router.put(
    '/users/me',
    authMiddleware,
    validate(updateProfileSchema),
    async (req: AuthenticatedRequest, res) => {
      const {
        name,
        bio,
        avatar_url,
        accepted_pet_sizes,
        accepted_species,
        years_experience,
        home_type,
        has_yard,
        has_fenced_yard,
        has_own_pets,
        own_pets_description,
        skills,
        lat,
        lng,
        service_radius_miles,
        max_pets_at_once,
        max_pets_per_walk,
        house_rules,
        emergency_procedures,
        has_insurance,
        emergency_contact_name,
        emergency_contact_phone,
        emergency_contact_relationship,
        lifestyle_badges,
        phone,
        share_phone_for_bookings,
        has_cameras,
        camera_locations,
        camera_policy_note,
        camera_preference,
        children_ages,
        non_smoking_home,
        children_in_home,
      } = req.body;

      // Slug is permanent — does not change when name is updated
      await sql`
      UPDATE users SET name = ${name}, bio = ${bio || null}, avatar_url = ${avatar_url || null}
      ${accepted_pet_sizes !== undefined ? sql`, accepted_pet_sizes = ${accepted_pet_sizes || []}` : sql``}
      ${accepted_species !== undefined ? sql`, accepted_species = ${accepted_species || []}` : sql``}
      ${years_experience !== undefined ? sql`, years_experience = ${years_experience}` : sql``}
      ${home_type !== undefined ? sql`, home_type = ${home_type || null}` : sql``}
      ${has_yard !== undefined ? sql`, has_yard = ${has_yard ?? false}` : sql``}
      ${has_fenced_yard !== undefined ? sql`, has_fenced_yard = ${has_fenced_yard ?? false}` : sql``}
      ${has_own_pets !== undefined ? sql`, has_own_pets = ${has_own_pets ?? false}` : sql``}
      ${own_pets_description !== undefined ? sql`, own_pets_description = ${own_pets_description || null}` : sql``}
      ${skills !== undefined ? sql`, skills = ${skills || []}` : sql``}
      ${lat !== undefined && lng !== undefined ? sql`, lat = ${lat}, lng = ${lng}, location = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography` : sql``}
      ${service_radius_miles !== undefined ? sql`, service_radius_miles = ${service_radius_miles}` : sql``}
      ${max_pets_at_once !== undefined ? sql`, max_pets_at_once = ${max_pets_at_once}` : sql``}
      ${max_pets_per_walk !== undefined ? sql`, max_pets_per_walk = ${max_pets_per_walk}` : sql``}
      ${house_rules !== undefined ? sql`, house_rules = ${house_rules || null}` : sql``}
      ${emergency_procedures !== undefined ? sql`, emergency_procedures = ${emergency_procedures || null}` : sql``}
      ${has_insurance !== undefined ? sql`, has_insurance = ${has_insurance ?? false}` : sql``}
      ${emergency_contact_name !== undefined ? sql`, emergency_contact_name = ${emergency_contact_name || null}` : sql``}
      ${emergency_contact_phone !== undefined ? sql`, emergency_contact_phone = ${emergency_contact_phone || null}` : sql``}
      ${emergency_contact_relationship !== undefined ? sql`, emergency_contact_relationship = ${emergency_contact_relationship || null}` : sql``}
      ${lifestyle_badges !== undefined ? sql`, lifestyle_badges = ${lifestyle_badges || []}` : sql``}
      ${phone !== undefined ? sql`, phone = ${phone || null}` : sql``}
      ${share_phone_for_bookings !== undefined ? sql`, share_phone_for_bookings = ${share_phone_for_bookings ?? true}` : sql``}
      ${has_cameras !== undefined ? sql`, has_cameras = ${has_cameras ?? false}` : sql``}
      ${camera_locations !== undefined ? sql`, camera_locations = ${camera_locations || []}` : sql``}
      ${camera_policy_note !== undefined ? sql`, camera_policy_note = ${camera_policy_note || null}` : sql``}
      ${camera_preference !== undefined ? sql`, camera_preference = ${camera_preference || 'no_preference'}` : sql``}
      ${children_ages !== undefined ? sql`, children_ages = ${children_ages || null}` : sql``}
      ${non_smoking_home !== undefined ? sql`, non_smoking_home = ${non_smoking_home ?? false}` : sql``}
      ${children_in_home !== undefined ? sql`, children_in_home = ${children_in_home ?? false}` : sql``}
      WHERE id = ${req.userId}
    `;

      const [user] = await sql`
      SELECT id, email, name, roles, bio, avatar_url, lat, lng, slug, accepted_pet_sizes, accepted_species, years_experience, home_type, has_yard, has_fenced_yard, has_own_pets, own_pets_description, skills, service_radius_miles, max_pets_at_once, max_pets_per_walk, cancellation_policy, house_rules, emergency_procedures, has_insurance, subscription_tier, approval_status, approval_rejected_reason, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship, lifestyle_badges, non_smoking_home, one_client_at_a_time, phone, share_phone_for_bookings, has_cameras, camera_locations, camera_policy_note, camera_preference, children_ages FROM users WHERE id = ${req.userId}
    `;

      res.json({ user: { ...user, is_admin: isAdminUser(user.email, user.roles) } });
    },
  );

  // --- Become a Sitter ---
  router.post('/users/me/become-sitter', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const userId = req.userId!;

    const [user] = await sql`SELECT roles, approval_status FROM users WHERE id = ${userId}`;
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    if (user.roles.includes('sitter')) {
      res.status(400).json({ error: 'You are already a sitter' });
      return;
    }

    if (user.approval_status === 'pending_approval' || user.approval_status === 'onboarding') {
      res.status(400).json({ error: 'Your sitter application is already in progress' });
      return;
    }

    if (user.approval_status === 'banned') {
      res.status(403).json({ error: 'Your account has been suspended' });
      return;
    }

    await sql`
      UPDATE users SET
        roles = array_append(roles, 'sitter'),
        approval_status = 'onboarding'
      WHERE id = ${userId}
    `;

    const [updated] = await sql`
      SELECT id, email, name, roles, bio, avatar_url, lat, lng, slug, accepted_pet_sizes, accepted_species, years_experience, home_type, has_yard, has_fenced_yard, has_own_pets, own_pets_description, skills, service_radius_miles, max_pets_at_once, max_pets_per_walk, cancellation_policy, house_rules, emergency_procedures, has_insurance, subscription_tier, approval_status, approval_rejected_reason, lifestyle_badges, non_smoking_home, one_client_at_a_time, children_ages FROM users WHERE id = ${userId}
    `;

    res.json({ user: { ...updated, is_admin: isAdminUser(updated.email, updated.roles) } });
  });

  // --- Submit Sitter Application (after completing Profile + Services) ---
  router.post('/users/me/submit-application', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
    const userId = req.userId!;

    const [user] = await sql`SELECT roles, approval_status, bio FROM users WHERE id = ${userId}`;
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    if (!user.roles.includes('sitter')) {
      res.status(400).json({ error: 'You must start the sitter application first' });
      return;
    }
    if (user.approval_status !== 'onboarding') {
      res.status(400).json({ error: 'Application already submitted' });
      return;
    }

    // Validate required steps: Profile (bio) + at least one Service
    if (!user.bio) {
      res.status(400).json({ error: 'Please complete your profile (add a bio) before submitting' });
      return;
    }
    const [serviceCheck] = await sql`SELECT EXISTS(SELECT 1 FROM services WHERE sitter_id = ${userId}) as has_services`;
    if (!serviceCheck.has_services) {
      res.status(400).json({ error: 'Please add at least one service before submitting' });
      return;
    }

    const [result] = await sql`
      UPDATE users SET approval_status = 'pending_approval'
      WHERE id = ${userId} AND approval_status = 'onboarding'
      RETURNING id
    `;
    if (!result) {
      res.status(409).json({ error: 'Application was already submitted' });
      return;
    }

    const [updated] = await sql`
      SELECT id, email, name, roles, bio, avatar_url, lat, lng, slug, accepted_pet_sizes, accepted_species, years_experience, home_type, has_yard, has_fenced_yard, has_own_pets, own_pets_description, skills, service_radius_miles, max_pets_at_once, max_pets_per_walk, cancellation_policy, house_rules, emergency_procedures, has_insurance, subscription_tier, approval_status, approval_rejected_reason, lifestyle_badges, non_smoking_home, one_client_at_a_time, children_ages FROM users WHERE id = ${userId}
    `;

    res.json({ user: { ...updated, is_admin: isAdminUser(updated.email, updated.roles) } });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to submit application');
      res.status(500).json({ error: 'Failed to submit application' });
    }
  });

  // --- Record Onboarding Start ---
  router.post('/users/me/onboarding-started', authMiddleware, async (req: AuthenticatedRequest, res) => {
    // Only sitters can start onboarding; only set once (idempotent)
    const [user] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
    if (!user?.roles?.includes('sitter')) {
      res.status(403).json({ error: 'Sitter role required' });
      return;
    }
    await sql`
      UPDATE users SET onboarding_started_at = NOW()
      WHERE id = ${req.userId} AND onboarding_started_at IS NULL
    `;
    res.json({ ok: true });
  });

  // --- Owner Trust Profile (for sitters) ---
  router.get('/owners/:id/trust-profile', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const ownerId = Number(req.params.id);
      if (!Number.isInteger(ownerId) || ownerId <= 0) {
        res.status(400).json({ error: 'Invalid owner ID' });
        return;
      }

      // Verify requester is a sitter with a relationship to this owner
      const [requester] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
      if (!requester?.roles?.includes('sitter')) {
        res.status(403).json({ error: 'Only sitters can view owner trust profiles' });
        return;
      }

      const [hasRelationship] = await sql`
        SELECT EXISTS(
          SELECT 1 FROM bookings WHERE sitter_id = ${req.userId} AND owner_id = ${ownerId}
          UNION ALL
          SELECT 1 FROM inquiries WHERE sitter_id = ${req.userId} AND owner_id = ${ownerId}
        ) as has_relationship
      `;
      if (!hasRelationship?.has_relationship) {
        res.status(403).json({ error: 'No booking or inquiry relationship with this owner' });
        return;
      }

      // Fetch owner basic info
      const [owner] = await sql`SELECT id, name, avatar_url, created_at FROM users WHERE id = ${ownerId}`;
      if (!owner) {
        res.status(404).json({ error: 'Owner not found' });
        return;
      }

      // Parallel queries for trust data (all independent after access check)
      // NOTE: Stats are global across all sitters (like Uber rider ratings),
      // not scoped to the requesting sitter. This is intentional — owner
      // reputation should reflect their entire history.
      const [bookingStats, reviewStats, { pet_count }] = await Promise.all([
        sql`
          SELECT
            count(*) FILTER (WHERE status = 'completed')::int as completed_bookings,
            count(*) FILTER (WHERE status = 'cancelled')::int as total_cancellations
          FROM bookings WHERE owner_id = ${ownerId}
        `.then(r => r[0]),
        sql`
          SELECT
            count(*)::int as review_count,
            ROUND(avg(rating)::numeric, 1)::float as avg_rating,
            ROUND(avg(pet_accuracy_rating)::numeric, 1)::float as avg_pet_accuracy,
            ROUND(avg(communication_rating)::numeric, 1)::float as avg_communication,
            ROUND(avg(preparedness_rating)::numeric, 1)::float as avg_preparedness
          FROM reviews
          WHERE reviewee_id = ${ownerId}
            AND hidden_at IS NULL
            AND (published_at IS NOT NULL OR created_at < NOW() - INTERVAL '3 days')
            AND pet_accuracy_rating IS NOT NULL
        `.then(r => r[0]),
        sql`SELECT count(*)::int as pet_count FROM pets WHERE owner_id = ${ownerId}`.then(r => r[0]),
      ]);

      // Compute badges
      // NOTE: "verified_owner" = completed bookings with zero cancellations (any party).
      // We cannot distinguish owner vs sitter cancellations without a cancelled_by column.
      // This is a conservative metric — any cancellation disqualifies.
      const badges: ('verified_owner')[] = [];
      const completed = bookingStats.completed_bookings || 0;
      const cancelled = bookingStats.total_cancellations || 0;
      if (completed >= 1 && cancelled === 0) badges.push('verified_owner');

      const totalBookings = completed + cancelled;

      res.json({
        profile: {
          owner_id: owner.id,
          name: owner.name,
          avatar_url: owner.avatar_url,
          member_since: owner.created_at,
          completed_bookings: completed,
          cancelled_bookings: cancelled,
          cancellation_rate: totalBookings > 0 ? Number((cancelled / totalBookings).toFixed(3)) : 0,
          avg_rating: reviewStats.avg_rating ?? null,
          review_count: reviewStats.review_count || 0,
          avg_pet_accuracy: reviewStats.avg_pet_accuracy ?? null,
          avg_communication: reviewStats.avg_communication ?? null,
          avg_preparedness: reviewStats.avg_preparedness ?? null,
          pet_count,
          badges,
        },
      });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch owner trust profile');
      res.status(500).json({ error: 'Failed to load trust profile' });
    }
  });

  // --- Account Deletion (Soft Delete) ---
  router.delete('/users/me', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const userId = req.userId!;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await sql.begin(async (tx: any) => {
        // Check for active bookings inside transaction to avoid TOCTOU race
        const activeBookings = await tx`
          SELECT id FROM bookings
          WHERE (owner_id = ${userId} OR sitter_id = ${userId})
            AND status IN ('confirmed', 'in_progress')
          LIMIT 1
        `;
        if (activeBookings.length > 0) {
          throw new Error('ACTIVE_BOOKINGS');
        }

        // Cancel pending bookings (both as owner and sitter)
        await tx`
          UPDATE bookings SET status = 'cancelled'
          WHERE (owner_id = ${userId} OR sitter_id = ${userId}) AND status = 'pending'
        `;

        // Anonymize user
        const timestamp = Date.now();
        const anonymizedEmail = `deleted_${userId}_${timestamp}@deleted.petlink.app`;

        await tx`
          UPDATE users SET
            name = 'Deleted User',
            email = ${anonymizedEmail},
            bio = NULL,
            avatar_url = NULL,
            password_hash = NULL,
            lat = NULL,
            lng = NULL,
            deleted_at = NOW()
          WHERE id = ${userId}
        `;

        // Anonymize reviews written by this user
        await tx`
          UPDATE reviews SET comment = NULL
          WHERE reviewer_id = ${userId}
        `;

        // Clean up child data (soft delete doesn't trigger CASCADE)
        await tx`DELETE FROM oauth_accounts WHERE user_id = ${userId}`;
        await tx`DELETE FROM favorites WHERE user_id = ${userId} OR sitter_id = ${userId}`;
        await tx`DELETE FROM notification_preferences WHERE user_id = ${userId}`;
        await tx`DELETE FROM push_subscriptions WHERE user_id = ${userId}`;
        await tx`DELETE FROM sitter_photos WHERE sitter_id = ${userId}`;
        await tx`DELETE FROM sitter_posts WHERE sitter_id = ${userId}`;
        await tx`DELETE FROM post_destinations WHERE destination_type = 'profile' AND destination_id = ${userId}`;
        await tx`DELETE FROM post_destinations WHERE destination_type = 'pet' AND destination_id IN (SELECT id FROM pets WHERE owner_id = ${userId})`;
        await tx`DELETE FROM posts WHERE author_id = ${userId}`;
        await tx`DELETE FROM sitter_addons WHERE sitter_id = ${userId}`;
        await tx`DELETE FROM loyalty_discounts WHERE sitter_id = ${userId}`;
        await tx`DELETE FROM sitter_expenses WHERE sitter_id = ${userId}`;
        await tx`DELETE FROM featured_listings WHERE sitter_id = ${userId}`;
        await tx`DELETE FROM availability WHERE sitter_id = ${userId}`;
        await tx`DELETE FROM recurring_bookings WHERE owner_id = ${userId} OR sitter_id = ${userId}`;
        await tx`DELETE FROM services WHERE sitter_id = ${userId}`;
        await tx`DELETE FROM sitter_species_profiles WHERE sitter_id = ${userId}`;
        await tx`DELETE FROM verifications WHERE sitter_id = ${userId}`;
        await tx`DELETE FROM calendar_tokens WHERE user_id = ${userId}`;
        await tx`DELETE FROM imported_reviews WHERE sitter_id = ${userId}`;
        await tx`DELETE FROM sitter_references WHERE sitter_id = ${userId}`;
        await tx`DELETE FROM sitter_subscriptions WHERE sitter_id = ${userId}`;
        await tx`DELETE FROM profile_views WHERE sitter_id = ${userId}`;
      });

      // Revoke tokens after transaction commits (uses its own connection)
      await revokeAllUserTokens(userId);

      res.json({ success: true });
    } catch (error) {
      if (error instanceof Error && error.message === 'ACTIVE_BOOKINGS') {
        res.status(400).json({ error: 'Please complete or cancel active bookings before deleting your account.' });
        return;
      }
      logger.error({ err: sanitizeError(error) }, 'Account deletion failed');
      res.status(500).json({ error: 'Failed to delete account' });
    }
  });

  // --- Public Owner Profile (auth-gated) ---
  router.get('/owners/by-slug/:slug', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const slug = req.params.slug;
      if (!slug || slug.length > 100 || !/^[a-z0-9-]+$/.test(slug)) {
        res.status(400).json({ error: 'Invalid slug format' });
        return;
      }

      const [owner] = await sql`
        SELECT id, name, slug, avatar_url, bio, created_at, roles
        FROM users WHERE slug = ${req.params.slug} AND roles @> '{owner}'::text[]
      `;
      if (!owner) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      const [pets, [trustStats], [reviewAgg], reviews] = await Promise.all([
        sql`
          SELECT id, name, slug, species, breed, age, weight, gender, photo_url
          FROM pets WHERE owner_id = ${owner.id}
          ORDER BY id
        `,
        sql`
          SELECT
            COUNT(*)::int FILTER (WHERE status = 'completed') AS completed_bookings,
            COUNT(*)::int FILTER (WHERE status = 'cancelled' AND cancelled_by = 'owner') AS cancelled_count,
            COUNT(*)::int AS total_bookings
          FROM bookings WHERE owner_id = ${owner.id}
        `,
        sql`
          SELECT
            ROUND(AVG(rating)::numeric, 1) AS avg_rating,
            COUNT(*)::int AS review_count
          FROM reviews
          WHERE reviewee_id = ${owner.id} AND published_at IS NOT NULL
        `,
        sql`
          SELECT r.id, r.rating, r.comment, r.created_at,
                 CONCAT(SPLIT_PART(u.name, ' ', 1), ' ', LEFT(SPLIT_PART(u.name, ' ', 2), 1), '.') AS reviewer_name,
                 u.avatar_url AS reviewer_avatar
          FROM reviews r
          JOIN users u ON u.id = r.reviewer_id
          WHERE r.reviewee_id = ${owner.id} AND r.published_at IS NOT NULL
          ORDER BY r.created_at DESC
          LIMIT ${OWNER_PROFILE_REVIEW_LIMIT}
        `,
      ]);

      const completedBookings = trustStats?.completed_bookings || 0;
      const totalBookings = trustStats?.total_bookings || 0;
      const cancelledCount = trustStats?.cancelled_count || 0;
      const cancellationRate = totalBookings > 0 ? Math.round((cancelledCount / totalBookings) * 100) : 0;
      const avgRating = reviewAgg?.avg_rating != null ? Number(reviewAgg.avg_rating) : null;
      const reviewCount = reviewAgg?.review_count || 0;

      res.json({
        owner: {
          id: owner.id,
          name: owner.name,
          slug: owner.slug,
          avatar_url: owner.avatar_url,
          bio: owner.bio,
          created_at: owner.created_at,
          completed_bookings: completedBookings,
          avg_rating: avgRating,
          review_count: reviewCount,
          cancellation_rate: cancellationRate,
        },
        pets,
        reviews,
        isOwner: req.userId === owner.id,
      });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch owner profile');
      res.status(500).json({ error: 'Failed to fetch owner profile' });
    }
  });
}
