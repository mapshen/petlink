import type { Router } from 'express';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { adminMiddleware, isAdminUser } from '../admin.ts';
import { validate, createForumThreadSchema, createForumReplySchema, adminUpdateThreadSchema } from '../validation.ts';
import logger, { sanitizeError } from '../logger.ts';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/** Check if user has access to a space based on its role_gate */
function canAccessSpace(userRoles: string[], roleGate: string[] | null): boolean {
  if (!roleGate || roleGate.length === 0) return true;
  return roleGate.some(role => userRoles.includes(role));
}

export default function forumRoutes(router: Router): void {
  // ---- Community Spaces (Categories) ----
  router.get('/forum/categories', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
      if (!user) {
        res.status(403).json({ error: 'Authentication required' });
        return;
      }
      const userRoles: string[] = user.roles || [];

      const categories = await sql`
        SELECT
          fc.id, fc.name, fc.slug, fc.description, fc.sort_order,
          fc.space_type, fc.role_gate, fc.emoji, fc.member_count,
          COUNT(ft.id)::int AS thread_count,
          MAX(GREATEST(ft.created_at, ft.updated_at)) AS latest_activity
        FROM forum_categories fc
        LEFT JOIN forum_threads ft ON ft.category_id = fc.id
        WHERE fc.active = TRUE
        GROUP BY fc.id
        ORDER BY fc.sort_order ASC
      `;

      const filtered = categories.filter((c: { role_gate: string[] | null }) =>
        canAccessSpace(userRoles, c.role_gate)
      );

      res.json({ categories: filtered });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch forum categories');
      res.status(500).json({ error: 'Failed to fetch forum categories' });
    }
  });

  // ---- Trending posts across all accessible spaces ----
  router.get('/forum/trending', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
      if (!user) {
        res.status(403).json({ error: 'Authentication required' });
        return;
      }
      const userRoles: string[] = user.roles || [];

      const threads = await sql`
        SELECT
          ft.id, ft.title, ft.content, ft.created_at,
          fc.name AS space_name, fc.slug AS space_slug, fc.emoji AS space_emoji, fc.role_gate,
          u.name AS author_name, u.avatar_url AS author_avatar,
          COUNT(fr.id)::int AS reply_count
        FROM forum_threads ft
        JOIN forum_categories fc ON fc.id = ft.category_id
        JOIN users u ON u.id = ft.author_id
        LEFT JOIN forum_replies fr ON fr.thread_id = ft.id
        WHERE fc.active = TRUE
          AND ft.created_at > NOW() - INTERVAL '7 days'
        GROUP BY ft.id, fc.id, u.id
        ORDER BY COUNT(fr.id) DESC, ft.created_at DESC
        LIMIT 10
      `;

      const filtered = threads.filter((t: { role_gate: string[] | null }) =>
        canAccessSpace(userRoles, t.role_gate)
      );

      res.json({ threads: filtered });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch trending threads');
      res.status(500).json({ error: 'Failed to fetch trending threads' });
    }
  });

  // ---- Threads in a category (space) ----
  router.get('/forum/categories/:slug/threads', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
      const userRoles: string[] = user?.roles || [];

      const { slug } = req.params;
      const [category] = await sql`
        SELECT id, name, slug, description, space_type, role_gate, emoji, member_count
        FROM forum_categories WHERE slug = ${slug} AND active = TRUE
      `;
      if (!category) {
        res.status(404).json({ error: 'Space not found' });
        return;
      }

      if (!canAccessSpace(userRoles, category.role_gate)) {
        res.status(403).json({ error: 'You do not have access to this space' });
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

  // ---- Create thread (role-gated per space) ----
  router.post('/forum/threads', authMiddleware, validate(createForumThreadSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT roles, approval_status FROM users WHERE id = ${req.userId}`;
      if (!user) {
        res.status(403).json({ error: 'Authentication required' });
        return;
      }

      const { category_id, title, content } = req.body;
      const [category] = await sql`SELECT id, role_gate FROM forum_categories WHERE id = ${category_id} AND active = TRUE`;
      if (!category) {
        res.status(404).json({ error: 'Space not found' });
        return;
      }

      if (!canAccessSpace(user.roles || [], category.role_gate)) {
        res.status(403).json({ error: 'You do not have access to this space' });
        return;
      }

      // Sitter-gated spaces require approved sitter status
      if (category.role_gate?.includes('sitter') && user.approval_status !== 'approved') {
        res.status(403).json({ error: 'Your sitter account must be approved to post' });
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
      const userRoles: string[] = user?.roles || [];

      const threadId = Number(req.params.id);
      if (!Number.isInteger(threadId) || threadId <= 0) {
        res.status(400).json({ error: 'Invalid thread ID' });
        return;
      }

      const [thread] = await sql`
        SELECT
          ft.id, ft.category_id, ft.title, ft.content, ft.pinned, ft.locked,
          ft.created_at, ft.updated_at,
          u.id AS author_id, u.name AS author_name, u.avatar_url AS author_avatar,
          fc.role_gate
        FROM forum_threads ft
        JOIN users u ON u.id = ft.author_id
        JOIN forum_categories fc ON fc.id = ft.category_id
        WHERE ft.id = ${threadId}
      `;
      if (!thread) {
        res.status(404).json({ error: 'Thread not found' });
        return;
      }

      if (!canAccessSpace(userRoles, thread.role_gate)) {
        res.status(403).json({ error: 'You do not have access to this space' });
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

      res.json({ thread: { ...thread, role_gate: undefined }, replies, total: count });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch forum thread');
      res.status(500).json({ error: 'Failed to fetch forum thread' });
    }
  });

  // ---- Reply to thread (role-gated via thread's category) ----
  router.post('/forum/threads/:id/replies', authMiddleware, validate(createForumReplySchema), async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT roles, approval_status FROM users WHERE id = ${req.userId}`;

      const threadId = Number(req.params.id);
      if (!Number.isInteger(threadId) || threadId <= 0) {
        res.status(400).json({ error: 'Invalid thread ID' });
        return;
      }

      const [thread] = await sql`
        SELECT ft.id, ft.locked, fc.role_gate
        FROM forum_threads ft
        JOIN forum_categories fc ON fc.id = ft.category_id
        WHERE ft.id = ${threadId}
      `;
      if (!thread) {
        res.status(404).json({ error: 'Thread not found' });
        return;
      }
      if (thread.locked) {
        res.status(403).json({ error: 'This thread is locked' });
        return;
      }
      if (!canAccessSpace(user?.roles || [], thread.role_gate)) {
        res.status(403).json({ error: 'You do not have access to this space' });
        return;
      }

      // Sitter-gated spaces require approved sitter status for replies
      if (thread.role_gate?.includes('sitter') && user?.approval_status !== 'approved') {
        res.status(403).json({ error: 'Your sitter account must be approved to reply' });
        return;
      }

      const { content } = req.body;
      const [reply] = await sql`
        INSERT INTO forum_replies (thread_id, author_id, content)
        VALUES (${threadId}, ${req.userId}, ${content})
        RETURNING *
      `;
      await sql`UPDATE forum_threads SET updated_at = NOW() WHERE id = ${threadId}`;

      res.status(201).json({ reply });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to create forum reply');
      res.status(500).json({ error: 'Failed to create forum reply' });
    }
  });

  const ALLOWED_REACTIONS = ['👍', '❤️', '😂', '🎉', '😮', '🔥', '🫂', '💪', '😅'];

  // ---- Add reaction to thread or reply (role-gated) ----
  router.post('/forum/reactions', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const { thread_id, reply_id, emoji } = req.body;
      if ((!thread_id && !reply_id) || (thread_id && reply_id)) {
        res.status(400).json({ error: 'Provide either thread_id or reply_id' });
        return;
      }
      if (!emoji || !ALLOWED_REACTIONS.includes(emoji)) {
        res.status(400).json({ error: 'Invalid reaction emoji' });
        return;
      }
      const targetId = Number(thread_id || reply_id);
      if (!Number.isInteger(targetId) || targetId <= 0) {
        res.status(400).json({ error: 'Invalid target ID' });
        return;
      }

      // Check role gate for the target's space
      const [user] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
      const lookupSql = thread_id
        ? sql`SELECT fc.role_gate FROM forum_threads ft JOIN forum_categories fc ON fc.id = ft.category_id WHERE ft.id = ${targetId}`
        : sql`SELECT fc.role_gate FROM forum_replies fr JOIN forum_threads ft ON ft.id = fr.thread_id JOIN forum_categories fc ON fc.id = ft.category_id WHERE fr.id = ${targetId}`;
      const [target] = await lookupSql;
      if (!target || !canAccessSpace(user?.roles || [], target.role_gate)) {
        res.status(403).json({ error: 'You do not have access to this space' });
        return;
      }

      if (thread_id) {
        await sql`
          INSERT INTO forum_reactions (thread_id, user_id, emoji)
          VALUES (${targetId}, ${req.userId}, ${emoji})
          ON CONFLICT DO NOTHING
        `;
      } else {
        await sql`
          INSERT INTO forum_reactions (reply_id, user_id, emoji)
          VALUES (${targetId}, ${req.userId}, ${emoji})
          ON CONFLICT DO NOTHING
        `;
      }

      res.status(201).json({ success: true });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to add reaction');
      res.status(500).json({ error: 'Failed to add reaction' });
    }
  });

  // ---- Remove reaction (via query params) ----
  router.delete('/forum/reactions', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const thread_id = req.query.thread_id ? Number(req.query.thread_id) : null;
      const reply_id = req.query.reply_id ? Number(req.query.reply_id) : null;
      const emoji = req.query.emoji as string;
      if ((!thread_id && !reply_id) || (thread_id && reply_id) || !emoji) {
        res.status(400).json({ error: 'Provide either thread_id or reply_id plus emoji as query params' });
        return;
      }
      if (thread_id) {
        await sql`DELETE FROM forum_reactions WHERE thread_id = ${thread_id} AND user_id = ${req.userId} AND emoji = ${emoji}`;
      } else {
        await sql`DELETE FROM forum_reactions WHERE reply_id = ${reply_id} AND user_id = ${req.userId} AND emoji = ${emoji}`;
      }
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to remove reaction');
      res.status(500).json({ error: 'Failed to remove reaction' });
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
