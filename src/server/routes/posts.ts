import type { Router } from 'express';
import type { RateLimitRequestHandler } from 'express-rate-limit';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { validate, createSitterPostSchema } from '../validation.ts';
import { botBlockMiddleware, requireUserAgent } from '../bot-detection.ts';
import logger, { sanitizeError } from '../logger.ts';
import { MAX_POSTS_PER_USER } from './universal-posts.ts';

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;
/** @deprecated Use MAX_POSTS_PER_USER from universal-posts.ts */
export const MAX_POSTS_PER_SITTER = MAX_POSTS_PER_USER;

export default function postRoutes(router: Router, publicLimiter: RateLimitRequestHandler): void {
  // Compat: get pending share requests for the current owner (#343)
  // Reads from posts table, maps author_id → sitter_id for response compat
  router.get('/sitter-posts/pending-consent', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const posts = await sql`
        SELECT p.id, p.author_id AS sitter_id, p.content, p.photo_url, p.video_url,
               p.booking_id, p.walk_event_id, p.post_type, p.owner_consent_status,
               p.source_type, p.consent_owner_id AS owner_id, p.created_at,
               u.name AS sitter_name, u.avatar_url AS sitter_avatar
        FROM posts p
        JOIN users u ON u.id = p.author_id
        WHERE p.consent_owner_id = ${req.userId} AND p.owner_consent_status = 'pending'
        ORDER BY p.created_at DESC
      `;
      res.json({ posts });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch pending consent posts');
      res.status(500).json({ error: 'Failed to fetch pending requests' });
    }
  });

  // Compat: get posts for a sitter (paginated) — reads from posts + post_destinations
  router.get('/sitter-posts/:sitterId', requireUserAgent, botBlockMiddleware, publicLimiter, async (req, res) => {
    try {
      const sitterId = Number(req.params.sitterId);
      if (!Number.isInteger(sitterId) || sitterId <= 0) {
        res.status(400).json({ error: 'Invalid sitter ID' });
        return;
      }

      const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
      const offset = Math.max(Number(req.query.offset) || 0, 0);

      const [posts, [{ count }]] = await Promise.all([
        sql`
          SELECT p.id, p.author_id AS sitter_id, p.content, p.photo_url, p.video_url,
                 p.booking_id, p.walk_event_id, p.post_type, p.created_at
          FROM posts p
          JOIN post_destinations pd ON pd.post_id = p.id
          WHERE pd.destination_type = 'profile' AND pd.destination_id = ${sitterId}
            AND p.owner_consent_status = 'approved'
          ORDER BY p.created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `,
        sql`
          SELECT COUNT(*)::int AS count
          FROM posts p
          JOIN post_destinations pd ON pd.post_id = p.id
          WHERE pd.destination_type = 'profile' AND pd.destination_id = ${sitterId}
            AND p.owner_consent_status = 'approved'
        `,
      ]);

      res.json({ posts, total: count });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch sitter posts');
      res.status(500).json({ error: 'Failed to fetch sitter posts' });
    }
  });

  // Compat: create a post (sitter only) — writes to posts + post_destinations
  router.post('/sitter-posts', authMiddleware, validate(createSitterPostSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const [currentUser] = await sql`SELECT roles, approval_status FROM users WHERE id = ${req.userId}`;
      if (!currentUser.roles.includes('sitter')) {
        res.status(403).json({ error: 'Only sitters can create posts' });
        return;
      }
      if (currentUser.approval_status !== 'approved') {
        res.status(403).json({ error: 'Your sitter account is pending approval' });
        return;
      }

      const { content, photo_url, video_url, post_type } = req.body;

      const [post] = await sql`
        INSERT INTO posts (author_id, content, photo_url, video_url, post_type)
        SELECT ${req.userId}, ${content || null}, ${photo_url || null}, ${video_url || null}, ${post_type}
        WHERE (SELECT COUNT(*) FROM posts WHERE author_id = ${req.userId}) < ${MAX_POSTS_PER_USER}
        RETURNING *
      `;
      if (!post) {
        res.status(400).json({ error: `Maximum ${MAX_POSTS_PER_USER} posts allowed` });
        return;
      }

      // Auto-add profile destination
      await sql`
        INSERT INTO post_destinations (post_id, destination_type, destination_id)
        VALUES (${post.id}, 'profile', ${req.userId})
      `;

      // Return compat shape (author_id as sitter_id)
      res.status(201).json({
        post: {
          ...post,
          sitter_id: post.author_id,
        },
      });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to create sitter post');
      res.status(500).json({ error: 'Failed to create sitter post' });
    }
  });

  // Compat: delete own post
  router.delete('/sitter-posts/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'Invalid post ID' });
        return;
      }

      const [existing] = await sql`SELECT id FROM posts WHERE id = ${id} AND author_id = ${req.userId}`;
      if (!existing) {
        res.status(404).json({ error: 'Post not found' });
        return;
      }
      await sql`DELETE FROM posts WHERE id = ${id} AND author_id = ${req.userId}`;
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to delete sitter post');
      res.status(500).json({ error: 'Failed to delete sitter post' });
    }
  });

  // Compat: owner approves/denies a media share request (#343)
  router.put('/sitter-posts/:id/consent', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'Invalid post ID' });
        return;
      }
      const { status } = req.body;
      if (!['approved', 'denied'].includes(status)) {
        res.status(400).json({ error: 'Status must be approved or denied' });
        return;
      }

      const [updated] = await sql`
        UPDATE posts SET owner_consent_status = ${status}
        WHERE id = ${id} AND consent_owner_id = ${req.userId} AND owner_consent_status = 'pending'
        RETURNING *
      `;
      if (!updated) {
        res.status(404).json({ error: 'Post not found, not yours, or already resolved' });
        return;
      }
      res.json({ post: { ...updated, sitter_id: updated.author_id, owner_id: updated.consent_owner_id } });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to update post consent');
      res.status(500).json({ error: 'Failed to update consent' });
    }
  });

  // Compat: owner revokes consent
  router.put('/sitter-posts/:id/revoke', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'Invalid post ID' });
        return;
      }

      const [updated] = await sql`
        UPDATE posts SET owner_consent_status = 'denied'
        WHERE id = ${id} AND consent_owner_id = ${req.userId} AND owner_consent_status = 'approved'
        RETURNING *
      `;
      if (!updated) {
        res.status(404).json({ error: 'Post not found, not yours, or not currently approved' });
        return;
      }
      res.json({ post: { ...updated, sitter_id: updated.author_id, owner_id: updated.consent_owner_id } });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to revoke post consent');
      res.status(500).json({ error: 'Failed to revoke consent' });
    }
  });

}
