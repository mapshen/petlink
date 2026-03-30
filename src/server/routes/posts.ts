import type { Router } from 'express';
import type { RateLimitRequestHandler } from 'express-rate-limit';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { validate, createSitterPostSchema } from '../validation.ts';
import { botBlockMiddleware, requireUserAgent } from '../bot-detection.ts';

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;

export default function postRoutes(router: Router, publicLimiter: RateLimitRequestHandler): void {
  // Public: get posts for a sitter (paginated)
  router.get('/sitter-posts/:sitterId', requireUserAgent, botBlockMiddleware, publicLimiter, async (req, res) => {
    const sitterId = Number(req.params.sitterId);
    if (!Number.isInteger(sitterId) || sitterId <= 0) {
      res.status(400).json({ error: 'Invalid sitter ID' });
      return;
    }

    const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const posts = await sql`
      SELECT * FROM sitter_posts
      WHERE sitter_id = ${sitterId}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [{ count }] = await sql`
      SELECT COUNT(*)::int as count FROM sitter_posts WHERE sitter_id = ${sitterId}
    `;

    res.json({ posts, total: count });
  });

  // Auth: create a post
  router.post('/sitter-posts', authMiddleware, validate(createSitterPostSchema), async (req: AuthenticatedRequest, res) => {
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
      INSERT INTO sitter_posts (sitter_id, content, photo_url, video_url, post_type)
      VALUES (${req.userId}, ${content || null}, ${photo_url || null}, ${video_url || null}, ${post_type})
      RETURNING *
    `;

    res.status(201).json({ post });
  });

  // Auth: delete own post
  router.delete('/sitter-posts/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [existing] = await sql`SELECT id FROM sitter_posts WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
    if (!existing) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }
    await sql`DELETE FROM sitter_posts WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
    res.json({ success: true });
  });
}
