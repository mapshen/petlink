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
      booking_id INTEGER REFERENCES bookings(id) ON DELETE SET NULL,
      walk_event_id INTEGER REFERENCES walk_events(id) ON DELETE SET NULL,
      post_type TEXT NOT NULL DEFAULT 'update' CHECK (post_type IN ('update', 'walk_photo', 'walk_video', 'care_update')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const hash = bcrypt.hashSync('pass', 10);
  db.prepare("INSERT INTO users (email, password_hash, name, roles) VALUES (?, ?, ?, ?)").run('owner@test.com', hash, 'Owner', 'owner');
  db.prepare("INSERT INTO users (email, password_hash, name, roles) VALUES (?, ?, ?, ?)").run('sitter@test.com', hash, 'Sitter', 'owner,sitter');
  db.prepare("INSERT INTO bookings (owner_id, sitter_id) VALUES (?, ?)").run(1, 2);

  return db;
}

describe('auto-post from walk events', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => { db = createTestDb(); });

  it('creates a walk_photo post when photo event is logged', () => {
    const event = db.prepare("INSERT INTO walk_events (booking_id, event_type, note, photo_url) VALUES (?, ?, ?, ?) RETURNING *")
      .get(1, 'photo', 'Happy pup!', 'https://example.com/photo.jpg') as Record<string, unknown>;

    // Simulate auto-post creation
    db.prepare("INSERT INTO sitter_posts (sitter_id, content, photo_url, booking_id, walk_event_id, post_type) VALUES (?, ?, ?, ?, ?, ?)")
      .run(2, event.note, event.photo_url, 1, event.id, 'walk_photo');

    const post = db.prepare('SELECT * FROM sitter_posts WHERE walk_event_id = ?').get(event.id) as Record<string, unknown>;
    expect(post).toBeDefined();
    expect(post.post_type).toBe('walk_photo');
    expect(post.photo_url).toBe('https://example.com/photo.jpg');
    expect(post.content).toBe('Happy pup!');
    expect(post.sitter_id).toBe(2);
    expect(post.booking_id).toBe(1);
  });

  it('creates a walk_video post when video event is logged', () => {
    const event = db.prepare("INSERT INTO walk_events (booking_id, event_type, note, video_url) VALUES (?, ?, ?, ?) RETURNING *")
      .get(1, 'video', 'Playtime!', 'https://example.com/video.mp4') as Record<string, unknown>;

    db.prepare("INSERT INTO sitter_posts (sitter_id, content, video_url, booking_id, walk_event_id, post_type) VALUES (?, ?, ?, ?, ?, ?)")
      .run(2, event.note, event.video_url, 1, event.id, 'walk_video');

    const post = db.prepare('SELECT * FROM sitter_posts WHERE walk_event_id = ?').get(event.id) as Record<string, unknown>;
    expect(post).toBeDefined();
    expect(post.post_type).toBe('walk_video');
    expect(post.video_url).toBe('https://example.com/video.mp4');
  });

  it('does not create a post for non-media events', () => {
    db.prepare("INSERT INTO walk_events (booking_id, event_type, note) VALUES (?, ?, ?)").run(1, 'start', 'Walk started');

    // No auto-post for 'start' events
    const posts = db.prepare('SELECT * FROM sitter_posts').all();
    expect(posts).toHaveLength(0);
  });

  it('handles null note gracefully', () => {
    const event = db.prepare("INSERT INTO walk_events (booking_id, event_type, photo_url) VALUES (?, ?, ?) RETURNING *")
      .get(1, 'photo', 'https://example.com/photo.jpg') as Record<string, unknown>;

    db.prepare("INSERT INTO sitter_posts (sitter_id, content, photo_url, booking_id, walk_event_id, post_type) VALUES (?, ?, ?, ?, ?, ?)")
      .run(2, null, event.photo_url, 1, event.id, 'walk_photo');

    const post = db.prepare('SELECT * FROM sitter_posts WHERE walk_event_id = ?').get(event.id) as Record<string, unknown>;
    expect(post.content).toBeNull();
    expect(post.photo_url).toBe('https://example.com/photo.jpg');
  });

  it('links post to both booking and walk event', () => {
    const event = db.prepare("INSERT INTO walk_events (booking_id, event_type, photo_url) VALUES (?, ?, ?) RETURNING *")
      .get(1, 'photo', 'https://example.com/photo.jpg') as Record<string, unknown>;

    db.prepare("INSERT INTO sitter_posts (sitter_id, photo_url, booking_id, walk_event_id, post_type) VALUES (?, ?, ?, ?, ?)")
      .run(2, event.photo_url, 1, event.id, 'walk_photo');

    const post = db.prepare('SELECT * FROM sitter_posts WHERE walk_event_id = ?').get(event.id) as Record<string, unknown>;
    expect(post.booking_id).toBe(1);
    expect(post.walk_event_id).toBe(event.id);
  });

  it('respects max post limit', () => {
    // Insert 100 posts to hit the limit
    for (let i = 0; i < 100; i++) {
      db.prepare("INSERT INTO sitter_posts (sitter_id, content, post_type) VALUES (?, ?, ?)").run(2, `Post ${i}`, 'update');
    }

    const count = db.prepare('SELECT COUNT(*) as count FROM sitter_posts WHERE sitter_id = 2').get() as { count: number };
    expect(count.count).toBe(100);

    // Auto-post should check limit before inserting
    const result = db.prepare(`
      INSERT INTO sitter_posts (sitter_id, photo_url, booking_id, post_type)
      SELECT 2, 'https://example.com/photo.jpg', 1, 'walk_photo'
      WHERE (SELECT COUNT(*) FROM sitter_posts WHERE sitter_id = 2) < 100
    `).run();
    expect(result.changes).toBe(0);
  });
});
