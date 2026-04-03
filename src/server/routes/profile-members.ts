import type { Router } from 'express';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import logger, { sanitizeError } from '../logger.ts';

export default function profileMemberRoutes(router: Router): void {
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

  // Get profile members for a sitter (public)
  router.get('/profile-members/:sitterId', async (req, res) => {
    const sitterId = Number(req.params.sitterId);
    if (!Number.isInteger(sitterId) || sitterId <= 0) {
      res.status(400).json({ error: 'Invalid sitter ID' });
      return;
    }
    try {
      const members = await sql`
        SELECT id, name, avatar_url, role, background_check_status
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

  // Add a profile member (sitter adds their own co-sitter)
  router.post('/profile-members', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
      if (!user?.roles?.includes('sitter')) {
        res.status(403).json({ error: 'Only sitters can add profile members' });
        return;
      }

      const { name, avatar_url, role } = req.body;
      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Name is required' });
        return;
      }

      const validRoles = ['co_sitter', 'assistant'];
      const memberRole = validRoles.includes(role) ? role : 'co_sitter';

      // Limit: max 1 co-sitter per profile for now
      const [existing] = await sql`
        SELECT id FROM profile_members WHERE sitter_id = ${req.userId} LIMIT 1
      `;
      if (existing) {
        res.status(409).json({ error: 'You can only have one co-sitter. Remove the existing one first.' });
        return;
      }

      const [member] = await sql`
        INSERT INTO profile_members (sitter_id, name, avatar_url, role)
        VALUES (${req.userId}, ${name.trim()}, ${avatar_url || null}, ${memberRole})
        RETURNING id, sitter_id, name, avatar_url, role, background_check_status, created_at
      `;

      res.status(201).json({ member });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Error adding profile member');
      res.status(500).json({ error: 'Failed to add profile member' });
    }
  });

  // Update a profile member
  router.put('/profile-members/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const memberId = Number(req.params.id);
      const [existing] = await sql`
        SELECT id FROM profile_members WHERE id = ${memberId} AND sitter_id = ${req.userId}
      `;
      if (!existing) {
        res.status(404).json({ error: 'Profile member not found' });
        return;
      }

      const { name, avatar_url } = req.body;
      const [updated] = await sql`
        UPDATE profile_members
        SET name = ${name?.trim() || existing.name}, avatar_url = ${avatar_url ?? null}
        WHERE id = ${memberId} AND sitter_id = ${req.userId}
        RETURNING id, sitter_id, name, avatar_url, role, background_check_status, created_at
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
