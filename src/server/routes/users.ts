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
      WHERE id = ${req.userId}
    `;

      const [user] = await sql`
      SELECT id, email, name, roles, bio, avatar_url, lat, lng, slug, accepted_pet_sizes, accepted_species, years_experience, home_type, has_yard, has_fenced_yard, has_own_pets, own_pets_description, skills, service_radius_miles, max_pets_at_once, max_pets_per_walk, cancellation_policy, house_rules, emergency_procedures, has_insurance, subscription_tier, approval_status, approval_rejected_reason, emergency_contact_name, emergency_contact_phone, emergency_contact_relationship FROM users WHERE id = ${req.userId}
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
      SELECT id, email, name, roles, bio, avatar_url, lat, lng, slug, accepted_pet_sizes, accepted_species, years_experience, home_type, has_yard, has_fenced_yard, has_own_pets, own_pets_description, skills, service_radius_miles, max_pets_at_once, max_pets_per_walk, cancellation_policy, house_rules, emergency_procedures, has_insurance, subscription_tier, approval_status, approval_rejected_reason FROM users WHERE id = ${userId}
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
      SELECT id, email, name, roles, bio, avatar_url, lat, lng, slug, accepted_pet_sizes, accepted_species, years_experience, home_type, has_yard, has_fenced_yard, has_own_pets, own_pets_description, skills, service_radius_miles, max_pets_at_once, max_pets_per_walk, cancellation_policy, house_rules, emergency_procedures, has_insurance, subscription_tier, approval_status, approval_rejected_reason FROM users WHERE id = ${userId}
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

  // --- Account Deletion (Soft Delete) ---
  router.delete('/users/me', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const userId = req.userId!;

    // 1. Check for active bookings
    const activeBookings = await sql`
      SELECT id FROM bookings
      WHERE (owner_id = ${userId} OR sitter_id = ${userId})
        AND status IN ('confirmed', 'in_progress')
    `;

    if (activeBookings.length > 0) {
      res.status(400).json({
        error: 'Please complete or cancel active bookings before deleting your account.',
      });
      return;
    }

    // 2. Cancel pending bookings owned by the user
    await sql`
      UPDATE bookings SET status = 'cancelled'
      WHERE owner_id = ${userId} AND status = 'pending'
    `;

    // 3. Revoke all refresh tokens
    await revokeAllUserTokens(userId);

    // 4. Anonymize user
    const timestamp = Date.now();
    const anonymizedEmail = `deleted_${userId}_${timestamp}@deleted.petlink.app`;

    await sql`
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

    // 5. Anonymize reviews written by this user
    await sql`
      UPDATE reviews SET comment = NULL
      WHERE reviewer_id = ${userId}
    `;

    // 6. Clean up child data (soft delete doesn't trigger CASCADE)
    await sql`DELETE FROM oauth_accounts WHERE user_id = ${userId}`.catch(() => {});
    await sql`DELETE FROM favorites WHERE user_id = ${userId} OR sitter_id = ${userId}`.catch(() => {});
    await sql`DELETE FROM notification_preferences WHERE user_id = ${userId}`.catch(() => {});
    await sql`DELETE FROM push_subscriptions WHERE user_id = ${userId}`.catch(() => {});

    res.json({ success: true });
  });
}
