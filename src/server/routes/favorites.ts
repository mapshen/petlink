import type { Router } from 'express';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import logger, { sanitizeError } from '../logger.ts';

export default function favoriteRoutes(router: Router): void {
  router.get('/favorites', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const favorites = await sql`
        SELECT f.id, f.sitter_id, f.created_at,
               u.name as sitter_name, u.avatar_url as sitter_avatar, u.bio as sitter_bio
        FROM favorites f
        JOIN users u ON f.sitter_id = u.id
        WHERE f.user_id = ${req.userId}
        ORDER BY f.created_at DESC
      `;
      res.json({ favorites });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to load favorites');
      res.status(500).json({ error: 'Failed to load favorites' });
    }
  });

  router.post('/favorites/:sitterId', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const sitterId = Number(req.params.sitterId);
      if (!Number.isInteger(sitterId) || sitterId <= 0) {
        res.status(400).json({ error: 'Invalid sitter ID' });
        return;
      }
      if (sitterId === req.userId) {
        res.status(400).json({ error: 'Cannot favorite yourself' });
        return;
      }
      const [sitter] = await sql`SELECT id, roles FROM users WHERE id = ${sitterId}`;
      if (!sitter || !sitter.roles.includes('sitter')) {
        res.status(404).json({ error: 'Sitter not found' });
        return;
      }
      const [existing] = await sql`SELECT id FROM favorites WHERE user_id = ${req.userId} AND sitter_id = ${sitterId}`;
      if (existing) {
        res.status(409).json({ error: 'Already favorited' });
        return;
      }
      const [{ count: favCount }] = await sql`SELECT count(*)::int as count FROM favorites WHERE user_id = ${req.userId}`;
      if (favCount >= 100) {
        res.status(400).json({ error: 'Maximum of 100 favorites reached' });
        return;
      }
      const [favorite] = await sql`
        INSERT INTO favorites (user_id, sitter_id) VALUES (${req.userId}, ${sitterId}) RETURNING *
      `;
      res.status(201).json({ favorite });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to add favorite');
      res.status(500).json({ error: 'Failed to add favorite' });
    }
  });

  router.delete('/favorites/:sitterId', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const sitterId = Number(req.params.sitterId);
      if (!Number.isInteger(sitterId) || sitterId <= 0) {
        res.status(400).json({ error: 'Invalid sitter ID' });
        return;
      }
      const [deleted] = await sql`
        DELETE FROM favorites WHERE user_id = ${req.userId} AND sitter_id = ${sitterId} RETURNING id
      `;
      if (!deleted) {
        res.status(404).json({ error: 'Favorite not found' });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to remove favorite');
      res.status(500).json({ error: 'Failed to remove favorite' });
    }
  });
}
