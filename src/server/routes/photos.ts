import type { Router } from 'express';
import type { RateLimitRequestHandler } from 'express-rate-limit';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { validate, createSitterPhotoSchema, updateSitterPhotoSchema } from '../validation.ts';
import { botBlockMiddleware, requireUserAgent } from '../bot-detection.ts';
import logger, { sanitizeError } from '../logger.ts';

export default function photoRoutes(router: Router, publicLimiter: RateLimitRequestHandler): void {
  router.get('/sitter-photos/:sitterId', requireUserAgent, botBlockMiddleware, publicLimiter, async (req, res) => {
    try {
      const photos = await sql`
        SELECT * FROM sitter_photos WHERE sitter_id = ${req.params.sitterId} ORDER BY sort_order, created_at
      `;
      res.json({ photos });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch sitter photos');
      res.status(500).json({ error: 'Failed to fetch sitter photos' });
    }
  });

  router.post('/sitter-photos', authMiddleware, validate(createSitterPhotoSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const [currentUser] = await sql`SELECT roles, approval_status FROM users WHERE id = ${req.userId}`;
      if (!currentUser.roles.includes('sitter')) {
        res.status(403).json({ error: 'Only sitters can upload photos' });
        return;
      }
      if (currentUser.approval_status !== 'approved' && currentUser.approval_status !== 'onboarding') {
        res.status(403).json({ error: 'Your sitter account is not active.' });
        return;
      }
      const { photo_url, caption, sort_order } = req.body;
      // Atomic insert with limit check to prevent race condition
      const [photo] = await sql`
        INSERT INTO sitter_photos (sitter_id, photo_url, caption, sort_order)
        SELECT ${req.userId}, ${photo_url}, ${caption}, ${sort_order}
        WHERE (SELECT COUNT(*) FROM sitter_photos WHERE sitter_id = ${req.userId}) < 10
        RETURNING *
      `;
      if (!photo) {
        res.status(400).json({ error: 'Maximum 10 photos allowed' });
        return;
      }
      res.status(201).json({ photo });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to upload sitter photo');
      res.status(500).json({ error: 'Failed to upload sitter photo' });
    }
  });

  router.put('/sitter-photos/:id', authMiddleware, validate(updateSitterPhotoSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const [existing] = await sql`SELECT id FROM sitter_photos WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
      if (!existing) {
        res.status(404).json({ error: 'Photo not found' });
        return;
      }
      const { caption, sort_order } = req.body;
      const [photo] = await sql`
        UPDATE sitter_photos SET
          caption = COALESCE(${caption ?? null}, caption),
          sort_order = COALESCE(${sort_order ?? null}, sort_order)
        WHERE id = ${req.params.id} AND sitter_id = ${req.userId}
        RETURNING *
      `;
      res.json({ photo });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to update sitter photo');
      res.status(500).json({ error: 'Failed to update sitter photo' });
    }
  });

  router.delete('/sitter-photos/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [existing] = await sql`SELECT id FROM sitter_photos WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
      if (!existing) {
        res.status(404).json({ error: 'Photo not found' });
        return;
      }
      await sql`DELETE FROM sitter_photos WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to delete sitter photo');
      res.status(500).json({ error: 'Failed to delete sitter photo' });
    }
  });
}
