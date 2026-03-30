import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      roles TEXT DEFAULT 'owner',
      approval_status TEXT DEFAULT 'approved',
      bio TEXT, avatar_url TEXT, lat REAL, lng REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL REFERENCES users(id),
      sitter_id INTEGER NOT NULL REFERENCES users(id),
      status TEXT DEFAULT 'confirmed',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE walk_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      note TEXT,
      photo_url TEXT,
      video_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE sitter_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sitter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT,
      photo_url TEXT,
      video_url TEXT,
      booking_id INTEGER REFERENCES bookings(id),
      walk_event_id INTEGER REFERENCES walk_events(id),
      post_type TEXT NOT NULL DEFAULT 'update' CHECK (post_type IN ('update', 'walk_photo', 'walk_video', 'care_update')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX idx_sitter_posts_sitter ON sitter_posts(sitter_id, created_at DESC);
  `);

  const hash = bcrypt.hashSync('pass', 10);
  db.prepare("INSERT INTO users (email, password_hash, name, roles, approval_status) VALUES (?, ?, ?, ?, ?)").run('owner@test.com', hash, 'Owner', 'owner', 'approved');
  db.prepare("INSERT INTO users (email, password_hash, name, roles, approval_status) VALUES (?, ?, ?, ?, ?)").run('sitter@test.com', hash, 'Sitter', 'owner,sitter', 'approved');
  db.prepare("INSERT INTO users (email, password_hash, name, roles, approval_status) VALUES (?, ?, ?, ?, ?)").run('pending@test.com', hash, 'Pending', 'owner,sitter', 'pending_approval');

  // Create a booking between owner and sitter
  db.prepare("INSERT INTO bookings (owner_id, sitter_id, status) VALUES (?, ?, ?)").run(1, 2, 'completed');

  // Create walk events with media
  db.prepare("INSERT INTO walk_events (booking_id, event_type, note, photo_url) VALUES (?, ?, ?, ?)").run(1, 'photo', 'Happy pup!', 'https://example.com/walk-photo.jpg');
  db.prepare("INSERT INTO walk_events (booking_id, event_type, note, video_url) VALUES (?, ?, ?, ?)").run(1, 'video', 'Playtime!', 'https://example.com/walk-video.mp4');

  return db;
}

describe('sitter_posts schema', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => { db = createTestDb(); });

  it('should create a post with content only', () => {
    db.prepare("INSERT INTO sitter_posts (sitter_id, content, post_type) VALUES (?, ?, ?)").run(2, 'Hello world!', 'update');
    const post = db.prepare('SELECT * FROM sitter_posts WHERE sitter_id = 2').get() as Record<string, unknown>;
    expect(post).toBeDefined();
    expect(post.content).toBe('Hello world!');
    expect(post.post_type).toBe('update');
    expect(post.photo_url).toBeNull();
    expect(post.video_url).toBeNull();
  });

  it('should create a post with photo', () => {
    db.prepare("INSERT INTO sitter_posts (sitter_id, content, photo_url, post_type) VALUES (?, ?, ?, ?)").run(2, 'Check out this pup', 'https://example.com/photo.jpg', 'update');
    const post = db.prepare('SELECT * FROM sitter_posts WHERE sitter_id = 2').get() as Record<string, unknown>;
    expect(post.photo_url).toBe('https://example.com/photo.jpg');
  });

  it('should create a post with video', () => {
    db.prepare("INSERT INTO sitter_posts (sitter_id, content, video_url, post_type) VALUES (?, ?, ?, ?)").run(2, 'Fun walk!', 'https://example.com/video.mp4', 'walk_video');
    const post = db.prepare('SELECT * FROM sitter_posts WHERE sitter_id = 2').get() as Record<string, unknown>;
    expect(post.video_url).toBe('https://example.com/video.mp4');
    expect(post.post_type).toBe('walk_video');
  });

  it('should enforce valid post_type values', () => {
    expect(() => {
      db.prepare("INSERT INTO sitter_posts (sitter_id, post_type) VALUES (?, ?)").run(2, 'invalid');
    }).toThrow();
  });

  it('should allow all valid post_type values', () => {
    const types = ['update', 'walk_photo', 'walk_video', 'care_update'];
    for (const type of types) {
      db.prepare("INSERT INTO sitter_posts (sitter_id, content, post_type) VALUES (?, ?, ?)").run(2, `Type: ${type}`, type);
    }
    const count = db.prepare('SELECT COUNT(*) as count FROM sitter_posts WHERE sitter_id = 2').get() as { count: number };
    expect(count.count).toBe(4);
  });

  it('should link post to booking', () => {
    db.prepare("INSERT INTO sitter_posts (sitter_id, content, booking_id, post_type) VALUES (?, ?, ?, ?)").run(2, 'Great session', 1, 'care_update');
    const post = db.prepare('SELECT * FROM sitter_posts WHERE booking_id = 1').get() as Record<string, unknown>;
    expect(post.booking_id).toBe(1);
  });

  it('should link post to walk event', () => {
    db.prepare("INSERT INTO sitter_posts (sitter_id, content, walk_event_id, photo_url, post_type) VALUES (?, ?, ?, ?, ?)").run(2, 'From the walk', 1, 'https://example.com/walk-photo.jpg', 'walk_photo');
    const post = db.prepare('SELECT * FROM sitter_posts WHERE walk_event_id = 1').get() as Record<string, unknown>;
    expect(post.walk_event_id).toBe(1);
  });

  it('should cascade delete when sitter is deleted', () => {
    // Use a user (id=3) with no FK references from other tables
    db.prepare("INSERT INTO sitter_posts (sitter_id, content, post_type) VALUES (?, ?, ?)").run(3, 'Will be deleted', 'update');
    const before = db.prepare('SELECT COUNT(*) as count FROM sitter_posts WHERE sitter_id = 3').get() as { count: number };
    expect(before.count).toBe(1);

    db.prepare('DELETE FROM users WHERE id = 3').run();
    const after = db.prepare('SELECT COUNT(*) as count FROM sitter_posts WHERE sitter_id = 3').get() as { count: number };
    expect(after.count).toBe(0);
  });

  it('should order posts by created_at DESC', () => {
    db.prepare("INSERT INTO sitter_posts (sitter_id, content, post_type, created_at) VALUES (?, ?, ?, ?)").run(2, 'First', 'update', '2025-01-01 00:00:00');
    db.prepare("INSERT INTO sitter_posts (sitter_id, content, post_type, created_at) VALUES (?, ?, ?, ?)").run(2, 'Second', 'update', '2025-01-02 00:00:00');
    db.prepare("INSERT INTO sitter_posts (sitter_id, content, post_type, created_at) VALUES (?, ?, ?, ?)").run(2, 'Third', 'update', '2025-01-03 00:00:00');

    const posts = db.prepare('SELECT * FROM sitter_posts WHERE sitter_id = 2 ORDER BY created_at DESC').all() as Array<Record<string, unknown>>;
    expect(posts[0].content).toBe('Third');
    expect(posts[1].content).toBe('Second');
    expect(posts[2].content).toBe('First');
  });

  it('should support pagination with LIMIT and OFFSET', () => {
    for (let i = 0; i < 25; i++) {
      db.prepare("INSERT INTO sitter_posts (sitter_id, content, post_type) VALUES (?, ?, ?)").run(2, `Post ${i}`, 'update');
    }
    const page1 = db.prepare('SELECT * FROM sitter_posts WHERE sitter_id = 2 ORDER BY created_at DESC LIMIT 10 OFFSET 0').all();
    expect(page1).toHaveLength(10);

    const page2 = db.prepare('SELECT * FROM sitter_posts WHERE sitter_id = 2 ORDER BY created_at DESC LIMIT 10 OFFSET 10').all();
    expect(page2).toHaveLength(10);

    const page3 = db.prepare('SELECT * FROM sitter_posts WHERE sitter_id = 2 ORDER BY created_at DESC LIMIT 10 OFFSET 20').all();
    expect(page3).toHaveLength(5);
  });

  it('should count posts for a sitter', () => {
    db.prepare("INSERT INTO sitter_posts (sitter_id, content, post_type) VALUES (?, ?, ?)").run(2, 'A', 'update');
    db.prepare("INSERT INTO sitter_posts (sitter_id, content, post_type) VALUES (?, ?, ?)").run(2, 'B', 'walk_photo');
    const count = db.prepare('SELECT COUNT(*) as count FROM sitter_posts WHERE sitter_id = 2').get() as { count: number };
    expect(count.count).toBe(2);
  });

  it('should only return posts for the requested sitter', () => {
    // sitter_id=2 posts
    db.prepare("INSERT INTO sitter_posts (sitter_id, content, post_type) VALUES (?, ?, ?)").run(2, 'Sitter2 post', 'update');
    // No posts for sitter_id=3
    const posts = db.prepare('SELECT * FROM sitter_posts WHERE sitter_id = 3').all();
    expect(posts).toHaveLength(0);
  });
});
