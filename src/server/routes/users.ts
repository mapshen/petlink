import type { Router } from 'express';
import sql from '../db.ts';
import {
  authMiddleware,
  revokeAllUserTokens,
  type AuthenticatedRequest,
} from '../auth.ts';
import { validate, updateProfileSchema } from '../validation.ts';
import { isAdminUser } from '../admin.ts';

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
        accepted_species,
        years_experience,
        home_type,
        has_yard,
        has_fenced_yard,
        has_own_pets,
        own_pets_description,
        skills,
        service_radius_miles,
        max_pets_at_once,
        max_pets_per_walk,
      } = req.body;

      await sql`
      UPDATE users SET name = ${name}, bio = ${bio || null}, avatar_url = ${avatar_url || null}
      ${accepted_species !== undefined ? sql`, accepted_species = ${accepted_species || []}` : sql``}
      ${years_experience !== undefined ? sql`, years_experience = ${years_experience}` : sql``}
      ${home_type !== undefined ? sql`, home_type = ${home_type || null}` : sql``}
      ${has_yard !== undefined ? sql`, has_yard = ${has_yard ?? false}` : sql``}
      ${has_fenced_yard !== undefined ? sql`, has_fenced_yard = ${has_fenced_yard ?? false}` : sql``}
      ${has_own_pets !== undefined ? sql`, has_own_pets = ${has_own_pets ?? false}` : sql``}
      ${own_pets_description !== undefined ? sql`, own_pets_description = ${own_pets_description || null}` : sql``}
      ${skills !== undefined ? sql`, skills = ${skills || []}` : sql``}
      ${service_radius_miles !== undefined ? sql`, service_radius_miles = ${service_radius_miles}` : sql``}
      ${max_pets_at_once !== undefined ? sql`, max_pets_at_once = ${max_pets_at_once}` : sql``}
      ${max_pets_per_walk !== undefined ? sql`, max_pets_per_walk = ${max_pets_per_walk}` : sql``}
      WHERE id = ${req.userId}
    `;

      const [user] = await sql`
      SELECT id, email, name, roles, bio, avatar_url, lat, lng, accepted_pet_sizes, accepted_species, years_experience, home_type, has_yard, has_fenced_yard, has_own_pets, own_pets_description, skills, service_radius_miles, max_pets_at_once, max_pets_per_walk, approval_status, approval_rejected_reason FROM users WHERE id = ${req.userId}
    `;

      res.json({ user: { ...user, is_admin: isAdminUser(user.email, user.roles) } });
    },
  );

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

    res.json({ success: true });
  });
}
