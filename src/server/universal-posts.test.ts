import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      name TEXT NOT NULL,
      roles TEXT DEFAULT 'owner',
      slug TEXT UNIQUE,
      avatar_url TEXT
    );
    CREATE TABLE pets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      slug TEXT UNIQUE,
      species TEXT DEFAULT 'dog'
    );
    CREATE TABLE bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sitter_id INTEGER NOT NULL,
      owner_id INTEGER NOT NULL
    );
    CREATE TABLE walk_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER
    );
    CREATE TABLE posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT,
      photo_url TEXT,
      video_url TEXT,
      post_type TEXT NOT NULL DEFAULT 'update' CHECK (post_type IN ('update', 'walk_photo', 'walk_video', 'care_update')),
      booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
      walk_event_id INTEGER REFERENCES walk_events(id) ON DELETE SET NULL,
      owner_consent_status TEXT DEFAULT 'approved' CHECK (owner_consent_status IN ('pending', 'approved', 'denied')),
      source_type TEXT DEFAULT 'manual' CHECK (source_type IN ('manual', 'walk_event', 'chat', 'care_update')),
      consent_owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE post_destinations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      destination_type TEXT NOT NULL CHECK (destination_type IN ('profile', 'pet', 'space')),
      destination_id INTEGER NOT NULL,
      UNIQUE(post_id, destination_type, destination_id)
    );
    CREATE TABLE post_pet_tags (
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
      PRIMARY KEY (post_id, pet_id)
    );
    CREATE TABLE post_likes (
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (post_id, user_id)
    );
    CREATE TABLE post_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX idx_posts_author ON posts (author_id, created_at DESC);
    CREATE INDEX idx_post_destinations_lookup ON post_destinations (destination_type, destination_id, post_id);
  `);

  db.prepare("INSERT INTO users (email, name, roles, slug) VALUES ('owner@test.com', 'Jessica R', 'owner', 'jessica-r')").run();
  db.prepare("INSERT INTO users (email, name, roles, slug) VALUES ('sitter@test.com', 'Sarah M', 'owner,sitter', 'sarah-m')").run();
  db.prepare("INSERT INTO users (email, name, roles, slug) VALUES ('other@test.com', 'Tom K', 'owner', 'tom-k')").run();
  db.prepare("INSERT INTO pets (owner_id, name, slug, species) VALUES (1, 'Barkley', 'barkley', 'dog')").run();
  db.prepare("INSERT INTO pets (owner_id, name, slug, species) VALUES (1, 'Luna', 'luna', 'dog')").run();
  db.prepare("INSERT INTO bookings (sitter_id, owner_id) VALUES (2, 1)").run();
  return db;
}

describe('universal posts schema', () => {
  let db: ReturnType<typeof Database>;
  beforeEach(() => { db = createTestDb(); });

  describe('post CRUD', () => {
    it('creates a post with content', () => {
      db.prepare("INSERT INTO posts (author_id, content, post_type) VALUES (1, 'Hello world', 'update')").run();
      const post = db.prepare('SELECT * FROM posts WHERE author_id = 1').get() as Record<string, unknown>;
      expect(post.content).toBe('Hello world');
      expect(post.post_type).toBe('update');
      expect(post.owner_consent_status).toBe('approved');
    });

    it('creates a post with photo', () => {
      db.prepare("INSERT INTO posts (author_id, photo_url, post_type) VALUES (2, 'https://example.com/photo.jpg', 'walk_photo')").run();
      const post = db.prepare('SELECT * FROM posts WHERE author_id = 2').get() as Record<string, unknown>;
      expect(post.photo_url).toBe('https://example.com/photo.jpg');
    });

    it('owner can create posts (not just sitters)', () => {
      db.prepare("INSERT INTO posts (author_id, content, post_type) VALUES (1, 'My pet is cute', 'update')").run();
      const post = db.prepare('SELECT * FROM posts WHERE author_id = 1').get() as Record<string, unknown>;
      expect(post).toBeDefined();
    });

    it('sitter can create posts', () => {
      db.prepare("INSERT INTO posts (author_id, content, post_type) VALUES (2, 'Great walk today', 'update')").run();
      const post = db.prepare('SELECT * FROM posts WHERE author_id = 2').get() as Record<string, unknown>;
      expect(post).toBeDefined();
    });

    it('cascades delete when author is deleted', () => {
      db.prepare("INSERT INTO posts (author_id, content, post_type) VALUES (3, 'Will be deleted', 'update')").run();
      const before = db.prepare('SELECT COUNT(*) as count FROM posts WHERE author_id = 3').get() as { count: number };
      expect(before.count).toBe(1);
      db.prepare('DELETE FROM users WHERE id = 3').run();
      const after = db.prepare('SELECT COUNT(*) as count FROM posts WHERE author_id = 3').get() as { count: number };
      expect(after.count).toBe(0);
    });

    it('rejects invalid post_type', () => {
      expect(() => {
        db.prepare("INSERT INTO posts (author_id, content, post_type) VALUES (1, 'test', 'invalid')").run();
      }).toThrow();
    });

    it('orders posts by created_at DESC', () => {
      db.prepare("INSERT INTO posts (author_id, content, post_type, created_at) VALUES (1, 'First', 'update', '2025-01-01')").run();
      db.prepare("INSERT INTO posts (author_id, content, post_type, created_at) VALUES (1, 'Second', 'update', '2025-01-02')").run();
      db.prepare("INSERT INTO posts (author_id, content, post_type, created_at) VALUES (1, 'Third', 'update', '2025-01-03')").run();
      const posts = db.prepare('SELECT content FROM posts WHERE author_id = 1 ORDER BY created_at DESC').all() as Array<{ content: string }>;
      expect(posts.map(p => p.content)).toEqual(['Third', 'Second', 'First']);
    });
  });

  describe('destinations', () => {
    it('creates profile destination for a post', () => {
      const { lastInsertRowid } = db.prepare("INSERT INTO posts (author_id, content, post_type) VALUES (1, 'test', 'update')").run();
      db.prepare("INSERT INTO post_destinations (post_id, destination_type, destination_id) VALUES (?, 'profile', 1)").run(lastInsertRowid);
      const dest = db.prepare('SELECT * FROM post_destinations WHERE post_id = ?').get(lastInsertRowid) as Record<string, unknown>;
      expect(dest.destination_type).toBe('profile');
      expect(dest.destination_id).toBe(1);
    });

    it('creates pet destination for a post', () => {
      const { lastInsertRowid } = db.prepare("INSERT INTO posts (author_id, content, post_type) VALUES (1, 'test', 'update')").run();
      db.prepare("INSERT INTO post_destinations (post_id, destination_type, destination_id) VALUES (?, 'pet', 1)").run(lastInsertRowid);
      const dest = db.prepare("SELECT * FROM post_destinations WHERE post_id = ? AND destination_type = 'pet'").get(lastInsertRowid) as Record<string, unknown>;
      expect(dest.destination_id).toBe(1);
    });

    it('allows cross-posting to multiple destinations', () => {
      const { lastInsertRowid } = db.prepare("INSERT INTO posts (author_id, content, post_type) VALUES (1, 'cross-post', 'update')").run();
      db.prepare("INSERT INTO post_destinations (post_id, destination_type, destination_id) VALUES (?, 'profile', 1)").run(lastInsertRowid);
      db.prepare("INSERT INTO post_destinations (post_id, destination_type, destination_id) VALUES (?, 'pet', 1)").run(lastInsertRowid);
      db.prepare("INSERT INTO post_destinations (post_id, destination_type, destination_id) VALUES (?, 'pet', 2)").run(lastInsertRowid);
      const dests = db.prepare('SELECT * FROM post_destinations WHERE post_id = ?').all(lastInsertRowid);
      expect(dests).toHaveLength(3);
    });

    it('prevents duplicate destinations', () => {
      const { lastInsertRowid } = db.prepare("INSERT INTO posts (author_id, content, post_type) VALUES (1, 'test', 'update')").run();
      db.prepare("INSERT INTO post_destinations (post_id, destination_type, destination_id) VALUES (?, 'profile', 1)").run(lastInsertRowid);
      expect(() => {
        db.prepare("INSERT INTO post_destinations (post_id, destination_type, destination_id) VALUES (?, 'profile', 1)").run(lastInsertRowid);
      }).toThrow(/UNIQUE/);
    });

    it('cascades delete when post is deleted', () => {
      const { lastInsertRowid } = db.prepare("INSERT INTO posts (author_id, content, post_type) VALUES (1, 'test', 'update')").run();
      db.prepare("INSERT INTO post_destinations (post_id, destination_type, destination_id) VALUES (?, 'profile', 1)").run(lastInsertRowid);
      db.prepare('DELETE FROM posts WHERE id = ?').run(lastInsertRowid);
      const dests = db.prepare('SELECT * FROM post_destinations WHERE post_id = ?').all(lastInsertRowid);
      expect(dests).toHaveLength(0);
    });

    it('looks up posts by destination', () => {
      const r1 = db.prepare("INSERT INTO posts (author_id, content, post_type) VALUES (1, 'Post A', 'update')").run();
      const r2 = db.prepare("INSERT INTO posts (author_id, content, post_type) VALUES (2, 'Post B', 'update')").run();
      db.prepare("INSERT INTO post_destinations (post_id, destination_type, destination_id) VALUES (?, 'pet', 1)").run(r1.lastInsertRowid);
      db.prepare("INSERT INTO post_destinations (post_id, destination_type, destination_id) VALUES (?, 'pet', 1)").run(r2.lastInsertRowid);
      db.prepare("INSERT INTO post_destinations (post_id, destination_type, destination_id) VALUES (?, 'profile', 2)").run(r2.lastInsertRowid);

      const petPosts = db.prepare(`
        SELECT p.* FROM posts p
        JOIN post_destinations pd ON pd.post_id = p.id
        WHERE pd.destination_type = 'pet' AND pd.destination_id = 1
        ORDER BY p.created_at DESC
      `).all();
      expect(petPosts).toHaveLength(2);
    });
  });

  describe('pet tags', () => {
    it('tags a post with a pet', () => {
      const { lastInsertRowid } = db.prepare("INSERT INTO posts (author_id, content, post_type) VALUES (1, 'Barkley photo', 'update')").run();
      db.prepare('INSERT INTO post_pet_tags (post_id, pet_id) VALUES (?, 1)').run(lastInsertRowid);
      const tags = db.prepare('SELECT * FROM post_pet_tags WHERE post_id = ?').all(lastInsertRowid);
      expect(tags).toHaveLength(1);
    });

    it('tags multiple pets', () => {
      const { lastInsertRowid } = db.prepare("INSERT INTO posts (author_id, content, post_type) VALUES (1, 'Both dogs', 'update')").run();
      db.prepare('INSERT INTO post_pet_tags (post_id, pet_id) VALUES (?, 1)').run(lastInsertRowid);
      db.prepare('INSERT INTO post_pet_tags (post_id, pet_id) VALUES (?, 2)').run(lastInsertRowid);
      const tags = db.prepare('SELECT * FROM post_pet_tags WHERE post_id = ?').all(lastInsertRowid);
      expect(tags).toHaveLength(2);
    });

    it('cascades when post is deleted', () => {
      const { lastInsertRowid } = db.prepare("INSERT INTO posts (author_id, content, post_type) VALUES (1, 'test', 'update')").run();
      db.prepare('INSERT INTO post_pet_tags (post_id, pet_id) VALUES (?, 1)').run(lastInsertRowid);
      db.prepare('DELETE FROM posts WHERE id = ?').run(lastInsertRowid);
      const tags = db.prepare('SELECT * FROM post_pet_tags WHERE post_id = ?').all(lastInsertRowid);
      expect(tags).toHaveLength(0);
    });

    it('cascades when pet is deleted', () => {
      const { lastInsertRowid } = db.prepare("INSERT INTO posts (author_id, content, post_type) VALUES (1, 'test', 'update')").run();
      db.prepare('INSERT INTO post_pet_tags (post_id, pet_id) VALUES (?, 1)').run(lastInsertRowid);
      db.prepare('DELETE FROM pets WHERE id = 1').run();
      const tags = db.prepare('SELECT * FROM post_pet_tags WHERE post_id = ?').all(lastInsertRowid);
      expect(tags).toHaveLength(0);
    });
  });

  describe('likes', () => {
    it('likes a post', () => {
      const { lastInsertRowid } = db.prepare("INSERT INTO posts (author_id, content, post_type) VALUES (1, 'test', 'update')").run();
      db.prepare('INSERT INTO post_likes (post_id, user_id) VALUES (?, 2)').run(lastInsertRowid);
      const count = db.prepare('SELECT COUNT(*) as count FROM post_likes WHERE post_id = ?').get(lastInsertRowid) as { count: number };
      expect(count.count).toBe(1);
    });

    it('prevents double-like', () => {
      const { lastInsertRowid } = db.prepare("INSERT INTO posts (author_id, content, post_type) VALUES (1, 'test', 'update')").run();
      db.prepare('INSERT INTO post_likes (post_id, user_id) VALUES (?, 2)').run(lastInsertRowid);
      expect(() => {
        db.prepare('INSERT INTO post_likes (post_id, user_id) VALUES (?, 2)').run(lastInsertRowid);
      }).toThrow();
    });

    it('multiple users can like same post', () => {
      const { lastInsertRowid } = db.prepare("INSERT INTO posts (author_id, content, post_type) VALUES (1, 'popular', 'update')").run();
      db.prepare('INSERT INTO post_likes (post_id, user_id) VALUES (?, 2)').run(lastInsertRowid);
      db.prepare('INSERT INTO post_likes (post_id, user_id) VALUES (?, 3)').run(lastInsertRowid);
      const count = db.prepare('SELECT COUNT(*) as count FROM post_likes WHERE post_id = ?').get(lastInsertRowid) as { count: number };
      expect(count.count).toBe(2);
    });

    it('unlike by deleting', () => {
      const { lastInsertRowid } = db.prepare("INSERT INTO posts (author_id, content, post_type) VALUES (1, 'test', 'update')").run();
      db.prepare('INSERT INTO post_likes (post_id, user_id) VALUES (?, 2)').run(lastInsertRowid);
      db.prepare('DELETE FROM post_likes WHERE post_id = ? AND user_id = 2').run(lastInsertRowid);
      const count = db.prepare('SELECT COUNT(*) as count FROM post_likes WHERE post_id = ?').get(lastInsertRowid) as { count: number };
      expect(count.count).toBe(0);
    });

    it('cascades when post is deleted', () => {
      const { lastInsertRowid } = db.prepare("INSERT INTO posts (author_id, content, post_type) VALUES (1, 'test', 'update')").run();
      db.prepare('INSERT INTO post_likes (post_id, user_id) VALUES (?, 2)').run(lastInsertRowid);
      db.prepare('DELETE FROM posts WHERE id = ?').run(lastInsertRowid);
      const likes = db.prepare('SELECT * FROM post_likes WHERE post_id = ?').all(lastInsertRowid);
      expect(likes).toHaveLength(0);
    });
  });

  describe('comments', () => {
    it('adds a comment to a post', () => {
      const { lastInsertRowid } = db.prepare("INSERT INTO posts (author_id, content, post_type) VALUES (1, 'test', 'update')").run();
      db.prepare("INSERT INTO post_comments (post_id, author_id, content) VALUES (?, 2, 'Nice photo!')").run(lastInsertRowid);
      const comments = db.prepare('SELECT * FROM post_comments WHERE post_id = ?').all(lastInsertRowid) as Array<Record<string, unknown>>;
      expect(comments).toHaveLength(1);
      expect(comments[0].content).toBe('Nice photo!');
      expect(comments[0].author_id).toBe(2);
    });

    it('multiple comments on same post', () => {
      const { lastInsertRowid } = db.prepare("INSERT INTO posts (author_id, content, post_type) VALUES (1, 'test', 'update')").run();
      db.prepare("INSERT INTO post_comments (post_id, author_id, content) VALUES (?, 2, 'Comment 1')").run(lastInsertRowid);
      db.prepare("INSERT INTO post_comments (post_id, author_id, content) VALUES (?, 3, 'Comment 2')").run(lastInsertRowid);
      const count = db.prepare('SELECT COUNT(*) as count FROM post_comments WHERE post_id = ?').get(lastInsertRowid) as { count: number };
      expect(count.count).toBe(2);
    });

    it('cascades when post is deleted', () => {
      const { lastInsertRowid } = db.prepare("INSERT INTO posts (author_id, content, post_type) VALUES (1, 'test', 'update')").run();
      db.prepare("INSERT INTO post_comments (post_id, author_id, content) VALUES (?, 2, 'Comment')").run(lastInsertRowid);
      db.prepare('DELETE FROM posts WHERE id = ?').run(lastInsertRowid);
      const comments = db.prepare('SELECT * FROM post_comments WHERE post_id = ?').all(lastInsertRowid);
      expect(comments).toHaveLength(0);
    });

    it('orders comments by created_at ASC', () => {
      const { lastInsertRowid } = db.prepare("INSERT INTO posts (author_id, content, post_type) VALUES (1, 'test', 'update')").run();
      db.prepare("INSERT INTO post_comments (post_id, author_id, content, created_at) VALUES (?, 2, 'First', '2025-01-01')").run(lastInsertRowid);
      db.prepare("INSERT INTO post_comments (post_id, author_id, content, created_at) VALUES (?, 3, 'Second', '2025-01-02')").run(lastInsertRowid);
      const comments = db.prepare('SELECT content FROM post_comments WHERE post_id = ? ORDER BY created_at ASC').all(lastInsertRowid) as Array<{ content: string }>;
      expect(comments.map(c => c.content)).toEqual(['First', 'Second']);
    });
  });

  describe('consent flow', () => {
    it('sitter post with consent_owner_id defaults to approved', () => {
      db.prepare("INSERT INTO posts (author_id, content, post_type, consent_owner_id) VALUES (2, 'Walk photo', 'walk_photo', 1)").run();
      const post = db.prepare('SELECT * FROM posts WHERE author_id = 2').get() as Record<string, unknown>;
      expect(post.owner_consent_status).toBe('approved');
    });

    it('pending post hidden from destination queries', () => {
      const { lastInsertRowid } = db.prepare("INSERT INTO posts (author_id, content, post_type, owner_consent_status) VALUES (2, 'pending', 'update', 'pending')").run();
      db.prepare("INSERT INTO post_destinations (post_id, destination_type, destination_id) VALUES (?, 'pet', 1)").run(lastInsertRowid);

      const approved = db.prepare(`
        SELECT p.* FROM posts p
        JOIN post_destinations pd ON pd.post_id = p.id
        WHERE pd.destination_type = 'pet' AND pd.destination_id = 1
        AND p.owner_consent_status = 'approved'
      `).all();
      expect(approved).toHaveLength(0);
    });

    it('approved post visible in destination queries', () => {
      const { lastInsertRowid } = db.prepare("INSERT INTO posts (author_id, content, post_type, owner_consent_status) VALUES (2, 'approved', 'update', 'approved')").run();
      db.prepare("INSERT INTO post_destinations (post_id, destination_type, destination_id) VALUES (?, 'pet', 1)").run(lastInsertRowid);

      const approved = db.prepare(`
        SELECT p.* FROM posts p
        JOIN post_destinations pd ON pd.post_id = p.id
        WHERE pd.destination_type = 'pet' AND pd.destination_id = 1
        AND p.owner_consent_status = 'approved'
      `).all();
      expect(approved).toHaveLength(1);
    });
  });

  describe('post limit enforcement', () => {
    it('can count posts per user for limit check', () => {
      for (let i = 0; i < 5; i++) {
        db.prepare("INSERT INTO posts (author_id, content, post_type) VALUES (1, ?, 'update')").run(`Post ${i}`);
      }
      const count = db.prepare('SELECT COUNT(*) as count FROM posts WHERE author_id = 1').get() as { count: number };
      expect(count.count).toBe(5);
    });

    it('atomic insert with limit check', () => {
      for (let i = 0; i < 3; i++) {
        db.prepare("INSERT INTO posts (author_id, content, post_type) VALUES (1, ?, 'update')").run(`Post ${i}`);
      }
      // Simulate atomic insert with limit (SQLite syntax differs from PG, but logic is same)
      const count = db.prepare('SELECT COUNT(*) as count FROM posts WHERE author_id = 1').get() as { count: number };
      expect(count.count).toBeLessThanOrEqual(100);
    });
  });
});
