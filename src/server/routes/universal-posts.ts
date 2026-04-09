import type { Router } from 'express';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { validate, createPostSchema, createPostCommentSchema } from '../validation.ts';
import logger, { sanitizeError } from '../logger.ts';

export const MAX_POSTS_PER_USER = 100;
const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 50;

/** Verify post exists and is approved. Returns post or null. */
async function requireApprovedPost(id: number) {
  const [post] = await sql`SELECT id FROM posts WHERE id = ${id} AND owner_consent_status = 'approved'`;
  return post || null;
}

export default function universalPostRoutes(router: Router): void {
  // Get posts by destination (profile, pet, space) — auth required
  router.get('/posts/destination/:type/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const { type, id } = req.params;
      const destId = Number(id);
      if (!['profile', 'pet', 'space'].includes(type) || !Number.isInteger(destId) || destId <= 0) {
        res.status(400).json({ error: 'Invalid destination' });
        return;
      }

      const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_LIMIT);
      const offset = Math.max(Number(req.query.offset) || 0, 0);

      const [posts, [{ count }]] = await Promise.all([
        sql`
          SELECT p.id, p.author_id, p.content, p.photo_url, p.video_url, p.post_type,
                 p.booking_id, p.walk_event_id, p.created_at,
                 u.name AS author_name, u.avatar_url AS author_avatar_url,
                 (SELECT COUNT(*)::int FROM post_likes WHERE post_id = p.id) AS like_count,
                 (SELECT COUNT(*)::int FROM post_comments WHERE post_id = p.id) AS comment_count,
                 EXISTS(SELECT 1 FROM post_likes WHERE post_id = p.id AND user_id = ${req.userId}) AS user_liked
          FROM posts p
          JOIN post_destinations pd ON pd.post_id = p.id
          JOIN users u ON u.id = p.author_id
          WHERE pd.destination_type = ${type} AND pd.destination_id = ${destId}
            AND p.owner_consent_status = 'approved'
          ORDER BY p.created_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `,
        sql`
          SELECT COUNT(*)::int AS count
          FROM posts p
          JOIN post_destinations pd ON pd.post_id = p.id
          WHERE pd.destination_type = ${type} AND pd.destination_id = ${destId}
            AND p.owner_consent_status = 'approved'
        `,
      ]);

      // Fetch pet tags for all posts
      const postIds = posts.map((p: { id: number }) => p.id);
      const petTags = postIds.length > 0
        ? await sql`
            SELECT pt.post_id, pt.pet_id, pe.name AS pet_name, pe.slug AS pet_slug, pe.species AS pet_species
            FROM post_pet_tags pt
            JOIN pets pe ON pe.id = pt.pet_id
            WHERE pt.post_id = ANY(${postIds})
          `
        : [];

      const tagsByPost = new Map<number, typeof petTags>();
      for (const tag of petTags) {
        if (!tagsByPost.has(tag.post_id)) tagsByPost.set(tag.post_id, []);
        tagsByPost.get(tag.post_id)!.push(tag);
      }

      const enriched = posts.map((p: { id: number }) => ({
        ...p,
        pet_tags: tagsByPost.get(p.id) || [],
      }));

      res.json({ posts: enriched, total: count });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch posts by destination');
      res.status(500).json({ error: 'Failed to fetch posts' });
    }
  });

  // Get single post
  router.get('/posts/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'Invalid post ID' });
        return;
      }

      const [post] = await sql`
        SELECT p.*, u.name AS author_name, u.avatar_url AS author_avatar_url,
               (SELECT COUNT(*)::int FROM post_likes WHERE post_id = p.id) AS like_count,
               (SELECT COUNT(*)::int FROM post_comments WHERE post_id = p.id) AS comment_count,
               EXISTS(SELECT 1 FROM post_likes WHERE post_id = p.id AND user_id = ${req.userId}) AS user_liked
        FROM posts p
        JOIN users u ON u.id = p.author_id
        WHERE p.id = ${id} AND p.owner_consent_status = 'approved'
      `;
      if (!post) {
        res.status(404).json({ error: 'Post not found' });
        return;
      }

      const [destinations, petTags] = await Promise.all([
        sql`SELECT id, post_id, destination_type, destination_id FROM post_destinations WHERE post_id = ${id}`,
        sql`
          SELECT pt.post_id, pt.pet_id, pe.name AS pet_name, pe.slug AS pet_slug, pe.species AS pet_species
          FROM post_pet_tags pt
          JOIN pets pe ON pe.id = pt.pet_id
          WHERE pt.post_id = ${id}
        `,
      ]);

      res.json({ post: { ...post, destinations, pet_tags: petTags } });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch post');
      res.status(500).json({ error: 'Failed to fetch post' });
    }
  });

  // Create a post
  router.post('/posts', authMiddleware, validate(createPostSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const { content, photo_url, video_url, post_type, destinations, pet_tag_ids } = req.body;

      // Validate destination ownership
      if (destinations && destinations.length > 0) {
        for (const dest of destinations) {
          if (dest.destination_type === 'profile' && dest.destination_id !== req.userId) {
            res.status(403).json({ error: 'Cannot post to another user\'s profile' });
            return;
          }
          if (dest.destination_type === 'pet') {
            const [pet] = await sql`SELECT id FROM pets WHERE id = ${dest.destination_id} AND owner_id = ${req.userId}`;
            if (!pet) {
              res.status(403).json({ error: 'Cannot post to a pet you do not own' });
              return;
            }
          }
        }
      }

      // Validate pet tag ownership
      if (pet_tag_ids && pet_tag_ids.length > 0) {
        const ownedPets = await sql`SELECT id FROM pets WHERE id = ANY(${pet_tag_ids}) AND owner_id = ${req.userId}`;
        const ownedIds = new Set(ownedPets.map((p: { id: number }) => p.id));
        for (const petId of pet_tag_ids) {
          if (!ownedIds.has(petId)) {
            res.status(403).json({ error: 'Cannot tag a pet you do not own' });
            return;
          }
        }
      }

      // Atomic insert with limit check
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

      // Always add author's profile as destination
      await sql`
        INSERT INTO post_destinations (post_id, destination_type, destination_id)
        VALUES (${post.id}, 'profile', ${req.userId})
      `;

      // Add extra destinations
      if (destinations && destinations.length > 0) {
        for (const dest of destinations) {
          if (dest.destination_type === 'profile' && dest.destination_id === req.userId) continue;
          await sql`
            INSERT INTO post_destinations (post_id, destination_type, destination_id)
            VALUES (${post.id}, ${dest.destination_type}, ${dest.destination_id})
            ON CONFLICT (post_id, destination_type, destination_id) DO NOTHING
          `;
        }
      }

      // Add pet tags
      if (pet_tag_ids && pet_tag_ids.length > 0) {
        for (const petId of pet_tag_ids) {
          await sql`
            INSERT INTO post_pet_tags (post_id, pet_id)
            VALUES (${post.id}, ${petId})
            ON CONFLICT DO NOTHING
          `;
        }
      }

      res.status(201).json({ post });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to create post');
      res.status(500).json({ error: 'Failed to create post' });
    }
  });

  // Delete own post (atomic)
  router.delete('/posts/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'Invalid post ID' });
        return;
      }

      const [deleted] = await sql`DELETE FROM posts WHERE id = ${id} AND author_id = ${req.userId} RETURNING id`;
      if (!deleted) {
        res.status(404).json({ error: 'Post not found' });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to delete post');
      res.status(500).json({ error: 'Failed to delete post' });
    }
  });

  // Like a post (must be approved)
  router.post('/posts/:id/like', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'Invalid post ID' });
        return;
      }

      if (!await requireApprovedPost(id)) {
        res.status(404).json({ error: 'Post not found' });
        return;
      }

      await sql`
        INSERT INTO post_likes (post_id, user_id)
        VALUES (${id}, ${req.userId})
        ON CONFLICT (post_id, user_id) DO NOTHING
      `;
      const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM post_likes WHERE post_id = ${id}`;
      res.json({ liked: true, like_count: count });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to like post');
      res.status(500).json({ error: 'Failed to like post' });
    }
  });

  // Unlike a post (must be approved)
  router.delete('/posts/:id/like', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'Invalid post ID' });
        return;
      }

      if (!await requireApprovedPost(id)) {
        res.status(404).json({ error: 'Post not found' });
        return;
      }

      await sql`DELETE FROM post_likes WHERE post_id = ${id} AND user_id = ${req.userId}`;
      const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM post_likes WHERE post_id = ${id}`;
      res.json({ liked: false, like_count: count });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to unlike post');
      res.status(500).json({ error: 'Failed to unlike post' });
    }
  });

  // Get comments for a post (must be approved)
  router.get('/posts/:id/comments', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'Invalid post ID' });
        return;
      }

      if (!await requireApprovedPost(id)) {
        res.status(404).json({ error: 'Post not found' });
        return;
      }

      const limit = Math.min(Number(req.query.limit) || 20, 50);
      const offset = Math.max(Number(req.query.offset) || 0, 0);

      const [comments, [{ count }]] = await Promise.all([
        sql`
          SELECT c.id, c.post_id, c.author_id, c.content, c.created_at,
                 u.name AS author_name, u.avatar_url AS author_avatar_url
          FROM post_comments c
          JOIN users u ON u.id = c.author_id
          WHERE c.post_id = ${id}
          ORDER BY c.created_at ASC
          LIMIT ${limit} OFFSET ${offset}
        `,
        sql`SELECT COUNT(*)::int AS count FROM post_comments WHERE post_id = ${id}`,
      ]);

      res.json({ comments, total: count });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch comments');
      res.status(500).json({ error: 'Failed to fetch comments' });
    }
  });

  // Add a comment (must be approved)
  router.post('/posts/:id/comments', authMiddleware, validate(createPostCommentSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'Invalid post ID' });
        return;
      }

      if (!await requireApprovedPost(id)) {
        res.status(404).json({ error: 'Post not found' });
        return;
      }

      const [comment] = await sql`
        INSERT INTO post_comments (post_id, author_id, content)
        VALUES (${id}, ${req.userId}, ${req.body.content})
        RETURNING *
      `;
      res.status(201).json({ comment });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to add comment');
      res.status(500).json({ error: 'Failed to add comment' });
    }
  });

  // Delete own comment (or admin)
  router.delete('/posts/comments/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: 'Invalid comment ID' });
        return;
      }

      const [comment] = await sql`SELECT id, author_id FROM post_comments WHERE id = ${id}`;
      if (!comment) {
        res.status(404).json({ error: 'Comment not found' });
        return;
      }

      const [user] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
      if (comment.author_id !== req.userId && !user.roles.includes('admin')) {
        res.status(403).json({ error: 'Not authorized' });
        return;
      }

      await sql`DELETE FROM post_comments WHERE id = ${id}`;
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to delete comment');
      res.status(500).json({ error: 'Failed to delete comment' });
    }
  });

  // Owner consent flow
  router.put('/posts/:id/consent', authMiddleware, async (req: AuthenticatedRequest, res) => {
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
      res.json({ post: updated });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to update post consent');
      res.status(500).json({ error: 'Failed to update consent' });
    }
  });

  // Owner revoke consent
  router.put('/posts/:id/revoke', authMiddleware, async (req: AuthenticatedRequest, res) => {
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
      res.json({ post: updated });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to revoke post consent');
      res.status(500).json({ error: 'Failed to revoke consent' });
    }
  });
}
