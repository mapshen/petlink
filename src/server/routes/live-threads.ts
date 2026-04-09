import type { Router } from 'express';
import type { Server } from 'socket.io';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import logger, { sanitizeError } from '../logger.ts';
import { canAccessSpace } from '../space-access.ts';

const MAX_ACTIVE_THREADS_PER_SPACE = 3;
const AUTO_ARCHIVE_MINUTES = 120;
const MESSAGE_RATE_LIMIT = 10;
const MESSAGE_RATE_WINDOW_MS = 10000;
const MAX_LIVE_CONNECTIONS = 5;

async function verifyThreadAccess(threadId: number, userId: number): Promise<{ thread: any; allowed: boolean }> {
  const [thread] = await sql`SELECT lt.id, lt.space_id, lt.status FROM live_threads lt WHERE lt.id = ${threadId}`;
  if (!thread) return { thread: null, allowed: false };
  const [user] = await sql`SELECT roles FROM users WHERE id = ${userId}`;
  const [space] = await sql`SELECT role_gate FROM forum_categories WHERE id = ${thread.space_id}`;
  return { thread, allowed: canAccessSpace(user?.roles || [], space?.role_gate) };
}

export default function liveThreadRoutes(router: Router, io: Server): void {
  // List active live threads for a space
  router.get('/live-threads/space/:spaceId', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const spaceId = Number(req.params.spaceId);
      if (!Number.isInteger(spaceId) || spaceId <= 0) {
        res.status(400).json({ error: 'Invalid space ID' });
        return;
      }

      const [user] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
      const [space] = await sql`SELECT id, role_gate FROM forum_categories WHERE id = ${spaceId} AND active = TRUE`;
      if (!space || !canAccessSpace(user?.roles || [], space.role_gate)) {
        res.status(403).json({ error: 'You do not have access to this space' });
        return;
      }

      const threads = await sql`
        SELECT lt.id, lt.title, lt.status, lt.participant_count, lt.last_activity_at, lt.created_at,
               u.name AS creator_name, u.avatar_url AS creator_avatar_url
        FROM live_threads lt
        JOIN users u ON u.id = lt.creator_id
        WHERE lt.space_id = ${spaceId} AND lt.status = 'active'
        ORDER BY lt.last_activity_at DESC
      `;

      res.json({ threads });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch live threads');
      res.status(500).json({ error: 'Failed to fetch live threads' });
    }
  });

  // Create a live thread
  router.post('/live-threads', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const { space_id, title } = req.body;
      if (!space_id || !title || typeof title !== 'string' || title.length > 200) {
        res.status(400).json({ error: 'space_id and title (max 200 chars) required' });
        return;
      }

      const [user] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
      const [space] = await sql`SELECT id, name, emoji, role_gate FROM forum_categories WHERE id = ${space_id} AND active = TRUE`;
      if (!space || !canAccessSpace(user?.roles || [], space.role_gate)) {
        res.status(403).json({ error: 'You do not have access to this space' });
        return;
      }

      const [{ count }] = await sql`
        SELECT COUNT(*)::int AS count FROM live_threads WHERE space_id = ${space_id} AND status = 'active'
      `;
      if (count >= MAX_ACTIVE_THREADS_PER_SPACE) {
        res.status(400).json({ error: `Maximum ${MAX_ACTIVE_THREADS_PER_SPACE} active threads per space` });
        return;
      }

      const [thread] = await sql`
        INSERT INTO live_threads (space_id, creator_id, title)
        VALUES (${space_id}, ${req.userId}, ${title})
        RETURNING *
      `;

      io.to(`space-${space_id}`).emit('live_thread_created', {
        thread: { ...thread, creator_name: user?.name, space_name: space.name, space_emoji: space.emoji },
      });

      res.status(201).json({ thread });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to create live thread');
      res.status(500).json({ error: 'Failed to create live thread' });
    }
  });

  // Get messages for a live thread (role-gated)
  router.get('/live-threads/:id/messages', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'Invalid thread ID' });
        return;
      }

      const { thread, allowed } = await verifyThreadAccess(id, req.userId!);
      if (!thread) {
        res.status(404).json({ error: 'Thread not found' });
        return;
      }
      if (!allowed) {
        res.status(403).json({ error: 'You do not have access to this space' });
        return;
      }

      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);

      const messages = await sql`
        SELECT m.id, m.thread_id, m.author_id, m.content, m.photo_url, m.created_at,
               u.name AS author_name, u.avatar_url AS author_avatar_url
        FROM live_thread_messages m
        JOIN users u ON u.id = m.author_id
        WHERE m.thread_id = ${id}
        ORDER BY m.created_at ASC
        LIMIT ${limit} OFFSET ${offset}
      `;

      res.json({ messages });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch live thread messages');
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

  // Archive a live thread (creator or admin, role-gated)
  router.put('/live-threads/:id/archive', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'Invalid thread ID' });
        return;
      }

      const [thread] = await sql`SELECT id, creator_id, space_id FROM live_threads WHERE id = ${id} AND status = 'active'`;
      if (!thread) {
        res.status(404).json({ error: 'Live thread not found or already archived' });
        return;
      }

      const [user] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
      const [space] = await sql`SELECT role_gate FROM forum_categories WHERE id = ${thread.space_id}`;
      if (!canAccessSpace(user?.roles || [], space?.role_gate)) {
        res.status(403).json({ error: 'You do not have access to this space' });
        return;
      }
      if (thread.creator_id !== req.userId && !user?.roles?.includes('admin')) {
        res.status(403).json({ error: 'Only the creator or an admin can archive this thread' });
        return;
      }

      await sql`UPDATE live_threads SET status = 'archived' WHERE id = ${id}`;
      io.to(`live-thread-${id}`).emit('live_thread_archived', { thread_id: id });

      res.json({ success: true });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to archive live thread');
      res.status(500).json({ error: 'Failed to archive thread' });
    }
  });

  // Socket.io event handlers for live threads
  const socketRooms = new Map<string, Set<number>>();
  const messageLimiter = new Map<number, number[]>();
  const liveUserSockets = new Map<number, Set<string>>();

  io.on('connection', (socket) => {
    const userId = (socket as any).userId;
    if (!userId) return; // Auth middleware guarantees this, but defensive guard

    // Per-user connection limit
    const userSet = liveUserSockets.get(userId) ?? new Set<string>();
    if (userSet.size >= MAX_LIVE_CONNECTIONS) {
      socket.disconnect(true);
      return;
    }
    userSet.add(socket.id);
    liveUserSockets.set(userId, userSet);

    socket.on('join_live_thread', async (data: { thread_id: number }) => {
      const { thread_id } = data;
      if (!thread_id) return;

      const { thread, allowed } = await verifyThreadAccess(thread_id, userId);
      if (!thread || !allowed || thread.status !== 'active') return;

      const room = `live-thread-${thread_id}`;
      socket.join(room);

      const rooms = socketRooms.get(socket.id) ?? new Set();
      rooms.add(thread_id);
      socketRooms.set(socket.id, rooms);

      await sql`UPDATE live_threads SET participant_count = participant_count + 1, last_activity_at = NOW() WHERE id = ${thread_id}`;

      const [user] = await sql`SELECT name, avatar_url FROM users WHERE id = ${userId}`;
      io.to(room).emit('participant_joined', {
        user_id: userId,
        user_name: user?.name,
        user_avatar: user?.avatar_url,
      });
    });

    socket.on('leave_live_thread', async (data: { thread_id: number }) => {
      const room = `live-thread-${data.thread_id}`;
      socket.leave(room);
      const rooms = socketRooms.get(socket.id);
      if (rooms) rooms.delete(data.thread_id);
      await sql`UPDATE live_threads SET participant_count = GREATEST(participant_count - 1, 0) WHERE id = ${data.thread_id}`.catch(() => {});
      io.to(room).emit('participant_left', { user_id: userId });
    });

    // Disconnect cleanup — decrement participant count for all joined threads
    socket.on('disconnect', async () => {
      const rooms = socketRooms.get(socket.id) ?? new Set();
      for (const threadId of rooms) {
        await sql`UPDATE live_threads SET participant_count = GREATEST(participant_count - 1, 0) WHERE id = ${threadId}`.catch(() => {});
        io.to(`live-thread-${threadId}`).emit('participant_left', { user_id: userId });
      }
      socketRooms.delete(socket.id);
      messageLimiter.delete(userId);

      const set = liveUserSockets.get(userId);
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) liveUserSockets.delete(userId);
      }
    });

    socket.on('live_message', async (data: { thread_id: number; content: string; photo_url?: string }) => {
      const { thread_id, content, photo_url } = data;
      if (!thread_id || !content || typeof content !== 'string' || content.length > 2000) return;

      // Rate limit
      const now = Date.now();
      const timestamps = (messageLimiter.get(userId) ?? []).filter(t => now - t < MESSAGE_RATE_WINDOW_MS);
      if (timestamps.length >= MESSAGE_RATE_LIMIT) {
        socket.emit('error', { message: 'Too many messages, slow down' });
        return;
      }
      messageLimiter.set(userId, [...timestamps, now]);

      const { thread, allowed } = await verifyThreadAccess(thread_id, userId);
      if (!thread || thread.status !== 'active' || !allowed) return;

      // Validate photo_url (must be HTTPS)
      if (photo_url) {
        try {
          const url = new URL(photo_url);
          if (url.protocol !== 'https:') return;
        } catch {
          return;
        }
      }

      const [msg] = await sql`
        INSERT INTO live_thread_messages (thread_id, author_id, content, photo_url)
        VALUES (${thread_id}, ${userId}, ${content}, ${photo_url || null})
        RETURNING *
      `;

      await sql`UPDATE live_threads SET last_activity_at = NOW() WHERE id = ${thread_id}`;

      const [user] = await sql`SELECT name, avatar_url FROM users WHERE id = ${userId}`;
      io.to(`live-thread-${thread_id}`).emit('live_message', {
        ...msg,
        author_name: user?.name,
        author_avatar_url: user?.avatar_url,
      });
    });

    socket.on('live_typing', (data: { thread_id: number }) => {
      socket.to(`live-thread-${data.thread_id}`).emit('live_typing', { user_id: userId });
    });
  });

  // Auto-archive stale threads
  async function archiveStaleThreads() {
    try {
      const stale = await sql`
        UPDATE live_threads SET status = 'archived'
        WHERE status = 'active'
          AND last_activity_at < NOW() - INTERVAL '1 minute' * ${AUTO_ARCHIVE_MINUTES}
        RETURNING id
      `;
      for (const thread of stale) {
        io.to(`live-thread-${thread.id}`).emit('live_thread_archived', { thread_id: thread.id });
      }
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to archive stale live threads');
    }
  }

  // Store interval for potential cleanup during graceful shutdown
  const archiveInterval = setInterval(archiveStaleThreads, 10 * 60 * 1000);
  void archiveInterval; // referenced to prevent unused-var lint; cleared via process exit
  void archiveInterval; // stored for potential cleanup
}
