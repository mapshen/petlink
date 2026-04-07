import type { Router } from 'express';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { adminMiddleware, isAdminUser } from '../admin.ts';
import { validate, createForumThreadSchema, createForumReplySchema, adminUpdateThreadSchema } from '../validation.ts';
import logger, { sanitizeError } from '../logger.ts';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export default function forumRoutes(router: Router): void {
  // ---- Categories ----
  router.get('/forum/categories', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
      if (!user || !user.roles.includes('sitter')) {
        res.status(403).json({ error: 'Only sitters can access the forum' });
        return;
      }

      const categories = await sql`
        SELECT
          fc.id, fc.name, fc.slug, fc.description, fc.sort_order,
          COUNT(ft.id)::int AS thread_count
        FROM forum_categories fc
        LEFT JOIN forum_threads ft ON ft.category_id = fc.id
        GROUP BY fc.id
        ORDER BY fc.sort_order ASC
      `;

      res.json({ categories });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch forum categories');
      res.status(500).json({ error: 'Failed to fetch forum categories' });
    }
  });

  // ---- Threads in a category ----
  router.get('/forum/categories/:slug/threads', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
      if (!user || !user.roles.includes('sitter')) {
        res.status(403).json({ error: 'Only sitters can access the forum' });
        return;
      }

      const { slug } = req.params;
      const [category] = await sql`SELECT id, name, slug, description FROM forum_categories WHERE slug = ${slug}`;
      if (!category) {
        res.status(404).json({ error: 'Category not found' });
        return;
      }

      const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
      const offset = Math.max(Number(req.query.offset) || 0, 0);

      const [threads, [{ count }]] = await Promise.all([
        sql`
          SELECT
            ft.id, ft.title, ft.content, ft.pinned, ft.locked,
            ft.created_at, ft.updated_at,
            u.id AS author_id, u.name AS author_name, u.avatar_url AS author_avatar,
            COUNT(fr.id)::int AS reply_count
          FROM forum_threads ft
          JOIN users u ON u.id = ft.author_id
          LEFT JOIN forum_replies fr ON fr.thread_id = ft.id
          WHERE ft.category_id = ${category.id}
          GROUP BY ft.id, u.id
          ORDER BY ft.pinned DESC, ft.updated_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `,
        sql`SELECT COUNT(*)::int AS count FROM forum_threads WHERE category_id = ${category.id}`,
      ]);

      res.json({ category, threads, total: count });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch forum threads');
      res.status(500).json({ error: 'Failed to fetch forum threads' });
    }
  });

  // ---- Create thread ----
  router.post('/forum/threads', authMiddleware, validate(createForumThreadSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT roles, approval_status FROM users WHERE id = ${req.userId}`;
      if (!user || !user.roles.includes('sitter')) {
        res.status(403).json({ error: 'Only sitters can post in the forum' });
        return;
      }
      if (user.approval_status !== 'approved') {
        res.status(403).json({ error: 'Your sitter account must be approved to post' });
        return;
      }

      const { category_id, title, content } = req.body;

      const [category] = await sql`SELECT id FROM forum_categories WHERE id = ${category_id}`;
      if (!category) {
        res.status(404).json({ error: 'Category not found' });
        return;
      }

      const [thread] = await sql`
        INSERT INTO forum_threads (category_id, author_id, title, content)
        VALUES (${category_id}, ${req.userId}, ${title}, ${content})
        RETURNING *
      `;

      res.status(201).json({ thread });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to create forum thread');
      res.status(500).json({ error: 'Failed to create forum thread' });
    }
  });

  // ---- Thread detail with replies ----
  router.get('/forum/threads/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
      if (!user || !user.roles.includes('sitter')) {
        res.status(403).json({ error: 'Only sitters can access the forum' });
        return;
      }

      const threadId = Number(req.params.id);
      if (!Number.isInteger(threadId) || threadId <= 0) {
        res.status(400).json({ error: 'Invalid thread ID' });
        return;
      }

      const [thread] = await sql`
        SELECT
          ft.id, ft.category_id, ft.title, ft.content, ft.pinned, ft.locked,
          ft.created_at, ft.updated_at,
          u.id AS author_id, u.name AS author_name, u.avatar_url AS author_avatar
        FROM forum_threads ft
        JOIN users u ON u.id = ft.author_id
        WHERE ft.id = ${threadId}
      `;
      if (!thread) {
        res.status(404).json({ error: 'Thread not found' });
        return;
      }

      const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
      const offset = Math.max(Number(req.query.offset) || 0, 0);

      const [replies, [{ count }]] = await Promise.all([
        sql`
          SELECT
            fr.id, fr.content, fr.created_at, fr.updated_at,
            u.id AS author_id, u.name AS author_name, u.avatar_url AS author_avatar
          FROM forum_replies fr
          JOIN users u ON u.id = fr.author_id
          WHERE fr.thread_id = ${threadId}
          ORDER BY fr.created_at ASC
          LIMIT ${limit} OFFSET ${offset}
        `,
        sql`SELECT COUNT(*)::int AS count FROM forum_replies WHERE thread_id = ${threadId}`,
      ]);

      res.json({ thread, replies, total: count });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch forum thread');
      res.status(500).json({ error: 'Failed to fetch forum thread' });
    }
  });

  // ---- Reply to thread ----
  router.post('/forum/threads/:id/replies', authMiddleware, validate(createForumReplySchema), async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT roles, approval_status FROM users WHERE id = ${req.userId}`;
      if (!user || !user.roles.includes('sitter')) {
        res.status(403).json({ error: 'Only sitters can reply in the forum' });
        return;
      }
      if (user.approval_status !== 'approved') {
        res.status(403).json({ error: 'Your sitter account must be approved to reply' });
        return;
      }

      const threadId = Number(req.params.id);
      if (!Number.isInteger(threadId) || threadId <= 0) {
        res.status(400).json({ error: 'Invalid thread ID' });
        return;
      }

      const [thread] = await sql`SELECT id, locked FROM forum_threads WHERE id = ${threadId}`;
      if (!thread) {
        res.status(404).json({ error: 'Thread not found' });
        return;
      }
      if (thread.locked) {
        res.status(403).json({ error: 'This thread is locked' });
        return;
      }

      const { content } = req.body;

      const [reply] = await sql`
        INSERT INTO forum_replies (thread_id, author_id, content)
        VALUES (${threadId}, ${req.userId}, ${content})
        RETURNING *
      `;

      // Bump thread updated_at
      await sql`UPDATE forum_threads SET updated_at = NOW() WHERE id = ${threadId}`;

      res.status(201).json({ reply });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to create forum reply');
      res.status(500).json({ error: 'Failed to create forum reply' });
    }
  });

  // ---- Delete own thread (or admin) ----
  router.delete('/forum/threads/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const threadId = Number(req.params.id);
      if (!Number.isInteger(threadId) || threadId <= 0) {
        res.status(400).json({ error: 'Invalid thread ID' });
        return;
      }

      const [thread] = await sql`SELECT id, author_id FROM forum_threads WHERE id = ${threadId}`;
      if (!thread) {
        res.status(404).json({ error: 'Thread not found' });
        return;
      }

      const [user] = await sql`SELECT email, roles FROM users WHERE id = ${req.userId}`;

      if (thread.author_id !== req.userId && !isAdminUser(user.email, user.roles)) {
        res.status(403).json({ error: 'You can only delete your own threads' });
        return;
      }

      await sql`DELETE FROM forum_threads WHERE id = ${threadId}`;
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to delete forum thread');
      res.status(500).json({ error: 'Failed to delete forum thread' });
    }
  });

  // ---- Delete own reply (or admin) ----
  router.delete('/forum/replies/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const replyId = Number(req.params.id);
      if (!Number.isInteger(replyId) || replyId <= 0) {
        res.status(400).json({ error: 'Invalid reply ID' });
        return;
      }

      const [reply] = await sql`SELECT id, author_id FROM forum_replies WHERE id = ${replyId}`;
      if (!reply) {
        res.status(404).json({ error: 'Reply not found' });
        return;
      }

      const [user] = await sql`SELECT email, roles FROM users WHERE id = ${req.userId}`;

      if (reply.author_id !== req.userId && !isAdminUser(user.email, user.roles)) {
        res.status(403).json({ error: 'You can only delete your own replies' });
        return;
      }

      await sql`DELETE FROM forum_replies WHERE id = ${replyId}`;
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to delete forum reply');
      res.status(500).json({ error: 'Failed to delete forum reply' });
    }
  });

  // ---- Admin: pin/lock thread ----
  router.put('/admin/forum/threads/:id', adminMiddleware, validate(adminUpdateThreadSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const threadId = Number(req.params.id);
      if (!Number.isInteger(threadId) || threadId <= 0) {
        res.status(400).json({ error: 'Invalid thread ID' });
        return;
      }

      const [thread] = await sql`SELECT id FROM forum_threads WHERE id = ${threadId}`;
      if (!thread) {
        res.status(404).json({ error: 'Thread not found' });
        return;
      }

      const { pinned, locked } = req.body;

      if (pinned === undefined && locked === undefined) {
        res.status(400).json({ error: 'No valid fields to update' });
        return;
      }

      const [updated] = await sql`
        UPDATE forum_threads
        SET
          pinned = COALESCE(${pinned ?? null}, pinned),
          locked = COALESCE(${locked ?? null}, locked),
          updated_at = NOW()
        WHERE id = ${threadId}
        RETURNING *
      `;

      res.json({ thread: updated });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to update forum thread');
      res.status(500).json({ error: 'Failed to update forum thread' });
    }
  });
}
