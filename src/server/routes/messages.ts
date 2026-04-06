import type { Router } from 'express';
import type { Server } from 'socket.io';
import sql from '../db.ts';
import { authMiddleware, verifyToken, type AuthenticatedRequest } from '../auth.ts';
import { messageSearchSchema } from '../validation.ts';
import { createNotification, getPreferences } from '../notifications.ts';
import { sendEmail, buildNewMessageEmail } from '../email.ts';
import logger, { sanitizeError } from '../logger.ts';

export default function messageRoutes(router: Router, io: Server): void {
  router.get('/conversations', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
    const conversations = await sql`
      WITH last_messages AS (
        SELECT DISTINCT ON (
          LEAST(sender_id, receiver_id),
          GREATEST(sender_id, receiver_id)
        )
          sender_id,
          receiver_id,
          content,
          created_at
        FROM messages
        WHERE sender_id = ${req.userId} OR receiver_id = ${req.userId}
        ORDER BY
          LEAST(sender_id, receiver_id),
          GREATEST(sender_id, receiver_id),
          created_at DESC
      ),
      unread_counts AS (
        SELECT sender_id AS from_user, COUNT(*)::int AS unread
        FROM messages
        WHERE receiver_id = ${req.userId} AND read_at IS NULL
        GROUP BY sender_id
      )
      SELECT
        u.id AS other_user_id,
        u.name AS other_user_name,
        u.avatar_url AS other_user_avatar,
        lm.content AS last_message,
        lm.created_at AS last_message_at,
        COALESCE(uc.unread, 0)::int AS unread_count
      FROM last_messages lm
      JOIN users u ON u.id = CASE
        WHEN lm.sender_id = ${req.userId} THEN lm.receiver_id
        ELSE lm.sender_id
      END
      LEFT JOIN unread_counts uc ON uc.from_user = u.id
      ORDER BY lm.created_at DESC
    `;
    res.json({ conversations });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Conversations fetch failed');
      res.status(500).json({ error: 'Failed to load conversations' });
    }
  });

  // GET /messages/search — search message history (MUST be before :userId route)
  router.get('/messages/search', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = messageSearchSchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid search query' });
        return;
      }

      const { q, userId, limit, offset } = parsed.data;
      // Escape ILIKE wildcards in user input
      const escaped = q.replace(/[%_\\]/g, '\\$&');
      const searchPattern = `%${escaped}%`;

      const results = userId
        ? await sql`
            SELECT m.id, m.content, m.sender_id, m.receiver_id, m.created_at,
              u.id as other_user_id, u.name as other_user_name, u.avatar_url as other_user_avatar
            FROM messages m
            JOIN users u ON u.id = CASE
              WHEN m.sender_id = ${req.userId} THEN m.receiver_id
              ELSE m.sender_id
            END
            WHERE ((m.sender_id = ${req.userId} AND m.receiver_id = ${userId})
                OR (m.receiver_id = ${req.userId} AND m.sender_id = ${userId}))
              AND m.content ILIKE ${searchPattern}
            ORDER BY m.created_at DESC
            LIMIT ${limit} OFFSET ${offset}
          `
        : await sql`
            SELECT m.id, m.content, m.sender_id, m.receiver_id, m.created_at,
              u.id as other_user_id, u.name as other_user_name, u.avatar_url as other_user_avatar
            FROM messages m
            JOIN users u ON u.id = CASE
              WHEN m.sender_id = ${req.userId} THEN m.receiver_id
              ELSE m.sender_id
            END
            WHERE (m.sender_id = ${req.userId} OR m.receiver_id = ${req.userId})
              AND m.content ILIKE ${searchPattern}
            ORDER BY m.created_at DESC
            LIMIT ${limit} OFFSET ${offset}
          `;

      const [{ total }] = userId
        ? await sql`
            SELECT count(*)::int as total FROM messages
            WHERE ((sender_id = ${req.userId} AND receiver_id = ${userId})
                OR (receiver_id = ${req.userId} AND sender_id = ${userId}))
              AND content ILIKE ${searchPattern}
          `
        : await sql`
            SELECT count(*)::int as total FROM messages
            WHERE (sender_id = ${req.userId} OR receiver_id = ${req.userId})
              AND content ILIKE ${searchPattern}
          `;

      res.json({ results, total });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Message search failed');
      res.status(500).json({ error: 'Search failed' });
    }
  });

  router.get('/messages/:userId', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
    const otherUserId = Number(req.params.userId);
    if (!Number.isInteger(otherUserId) || otherUserId <= 0) {
      res.status(400).json({ error: 'Invalid user ID' });
      return;
    }
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    // Mark messages as read first, then fetch (so read_at is populated in response)
    await sql`
      UPDATE messages SET read_at = NOW()
      WHERE sender_id = ${otherUserId} AND receiver_id = ${req.userId} AND read_at IS NULL
    `;
    const messages = await sql`
      SELECT * FROM messages
      WHERE (sender_id = ${req.userId} AND receiver_id = ${otherUserId})
         OR (sender_id = ${otherUserId} AND receiver_id = ${req.userId})
      ORDER BY created_at ASC
      LIMIT ${limit} OFFSET ${offset}
    `;
    res.json({ messages });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch messages');
      res.status(500).json({ error: 'Failed to load messages' });
    }
  });

  // Socket.io with JWT authentication
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const decoded = verifyToken(token);
      (socket as any).userId = decoded.userId;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  const userSockets = new Map<number, Set<string>>();
  const messageLimiter = new Map<number, number[]>();

  io.on('connection', (socket) => {
    const userId = (socket as any).userId;

    // Per-user connection limit (max 5)
    const userSet = userSockets.get(userId) ?? new Set<string>();
    if (userSet.size >= 5) {
      socket.emit('error', { message: 'Too many connections' });
      socket.disconnect(true);
      return;
    }
    userSockets.set(userId, new Set([...userSet, socket.id]));

    socket.join(String(userId));

    socket.on('disconnect', () => {
      const set = userSockets.get(userId);
      if (set) {
        const next = new Set([...set].filter(id => id !== socket.id));
        if (next.size === 0) {
          userSockets.delete(userId);
          messageLimiter.delete(userId);
        } else {
          userSockets.set(userId, next);
        }
      }
    });

    socket.on('send_message', async (data) => {
      try {
        // Rate limit: 10 messages per 10 seconds per user
        const now = Date.now();
        const timestamps = (messageLimiter.get(userId) ?? []).filter(t => now - t < 10000);
        if (timestamps.length >= 10) {
          socket.emit('error', { message: 'Too many messages, slow down' });
          return;
        }
        messageLimiter.set(userId, [...timestamps, now]);

        const { receiver_id, content } = data;
        if (!receiver_id || typeof receiver_id !== 'number') return;
        if (!content || typeof content !== 'string' || content.trim().length === 0) return;
        if (content.length > 5000) return;
        if (receiver_id === userId) return;

        const [recipient] = await sql`SELECT id FROM users WHERE id = ${receiver_id}`;
        if (!recipient) return;

        const trimmedContent = content.trim();
        const [message] = await sql`
          INSERT INTO messages (sender_id, receiver_id, content) VALUES (${userId}, ${receiver_id}, ${trimmedContent})
          RETURNING *
        `;

        io.to(String(receiver_id)).emit('receive_message', message);
        io.to(String(userId)).emit('receive_message', message);

        // Notify receiver of new message
        const [sender] = await sql`SELECT name FROM users WHERE id = ${userId}`;
        const notification = await createNotification(receiver_id, 'new_message', 'New Message', `${sender.name}: ${trimmedContent.substring(0, 100)}`, { sender_id: userId });
        if (notification) io.to(String(receiver_id)).emit('notification', notification);

        // Send email notification for new message
        const receiverPrefs = await getPreferences(receiver_id);
        if (receiverPrefs.email_enabled && receiverPrefs.new_message) {
          const [receiverUser] = await sql`SELECT name, email FROM users WHERE id = ${receiver_id}`;
          const msgEmail = buildNewMessageEmail({ recipientName: receiverUser.name, senderName: sender.name, messagePreview: trimmedContent.substring(0, 200) });
          sendEmail({ to: receiverUser.email, ...msgEmail }).catch(() => {});
        }
      } catch (error) {
        logger.error({ err: sanitizeError(error) }, 'Socket send_message error');
        socket.emit('error', { message: 'Failed to send message' });
      }
    });
  });

  io.engine.on('connection_error', (err: Error) => {
    logger.error({ err: sanitizeError(err) }, 'Socket.io connection error');
  });
}
