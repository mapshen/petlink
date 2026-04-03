import type { Router } from 'express';
import type { RateLimitRequestHandler } from 'express-rate-limit';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { botBlockMiddleware, requireUserAgent } from '../bot-detection.ts';
import { z } from 'zod';
import { validate } from '../validation.ts';
import logger, { sanitizeError } from '../logger.ts';

const addMemberSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  avatar_url: z.string().url().optional().nullable(),
  role: z.enum(['co_sitter', 'assistant']).default('co_sitter'),
});

const updateMemberSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  avatar_url: z.string().url().optional().nullable(),
});

export default function profileMemberRoutes(router: Router, publicLimiter?: RateLimitRequestHandler): void {
  // Get profile members for the current sitter
  router.get('/profile-members/me', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const members = await sql`
        SELECT id, sitter_id, name, avatar_url, role, background_check_status, created_at
        FROM profile_members
        WHERE sitter_id = ${req.userId}
        ORDER BY created_at
      `;
      res.json({ members });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Error fetching profile members');
      res.status(500).json({ error: 'Failed to fetch profile members' });
    }
  });

  // Get profile members for a sitter (public — only expose safe fields)
  const publicMiddleware = publicLimiter ? [requireUserAgent, botBlockMiddleware, publicLimiter] : [];
  router.get('/profile-members/:sitterId', ...publicMiddleware, async (req, res) => {
    const sitterId = Number(req.params.sitterId);
    if (!Number.isInteger(sitterId) || sitterId <= 0) {
      res.status(400).json({ error: 'Invalid sitter ID' });
      return;
    }
    try {
      const members = await sql`
        SELECT id, name, avatar_url, role,
          CASE WHEN background_check_status = 'passed' THEN true ELSE false END as background_check_passed
        FROM profile_members
        WHERE sitter_id = ${sitterId}
        ORDER BY created_at
      `;
      res.json({ members });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Error fetching profile members');
      res.status(500).json({ error: 'Failed to fetch profile members' });
    }
  });

  // Add a profile member
  router.post('/profile-members', authMiddleware, validate(addMemberSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
      if (!user?.roles?.includes('sitter')) {
        res.status(403).json({ error: 'Only sitters can add profile members' });
        return;
      }

      const { name, avatar_url, role } = req.body;

      // Max 1 co-sitter per profile (enforced by unique index + application check)
      const [existing] = await sql`
        SELECT id FROM profile_members WHERE sitter_id = ${req.userId} LIMIT 1
      `;
      if (existing) {
        res.status(409).json({ error: 'You can only have one co-sitter. Remove the existing one first.' });
        return;
      }

      const [member] = await sql`
        INSERT INTO profile_members (sitter_id, name, avatar_url, role)
        VALUES (${req.userId}, ${name}, ${avatar_url || null}, ${role})
        RETURNING id, sitter_id, name, avatar_url, role, background_check_status, created_at
      `;

      res.status(201).json({ member });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Error adding profile member');
      res.status(500).json({ error: 'Failed to add profile member' });
    }
  });

  // Update a profile member
  router.put('/profile-members/:id', authMiddleware, validate(updateMemberSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const memberId = Number(req.params.id);
      if (!Number.isInteger(memberId) || memberId <= 0) {
        res.status(400).json({ error: 'Invalid member ID' });
        return;
      }
      const [existing] = await sql`
        SELECT id, name, avatar_url FROM profile_members WHERE id = ${memberId} AND sitter_id = ${req.userId}
      `;
      if (!existing) {
        res.status(404).json({ error: 'Profile member not found' });
        return;
      }

      const { name, avatar_url } = req.body;
      const updatedName = name?.trim() || existing.name;
      const updatedAvatar = avatar_url !== undefined ? (avatar_url || null) : existing.avatar_url;

      const [updated] = await sql`
        UPDATE profile_members
        SET name = ${updatedName}, avatar_url = ${updatedAvatar}, updated_at = NOW()
        WHERE id = ${memberId} AND sitter_id = ${req.userId}
        RETURNING id, sitter_id, name, avatar_url, role, background_check_status, created_at, updated_at
      `;

      res.json({ member: updated });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Error updating profile member');
      res.status(500).json({ error: 'Failed to update profile member' });
    }
  });

  // Remove a profile member
  router.delete('/profile-members/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const memberId = Number(req.params.id);
      if (!Number.isInteger(memberId) || memberId <= 0) {
        res.status(400).json({ error: 'Invalid member ID' });
        return;
      }
      const [existing] = await sql`
        SELECT id FROM profile_members WHERE id = ${memberId} AND sitter_id = ${req.userId}
      `;
      if (!existing) {
        res.status(404).json({ error: 'Profile member not found' });
        return;
      }

      await sql`DELETE FROM profile_members WHERE id = ${memberId} AND sitter_id = ${req.userId}`;
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Error removing profile member');
      res.status(500).json({ error: 'Failed to remove profile member' });
    }
  });
}
