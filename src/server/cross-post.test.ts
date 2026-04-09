import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT, roles TEXT DEFAULT 'owner');
    CREATE TABLE pets (id INTEGER PRIMARY KEY, owner_id INTEGER REFERENCES users(id), name TEXT, slug TEXT);
    CREATE TABLE forum_categories (id INTEGER PRIMARY KEY, name TEXT, slug TEXT UNIQUE);
    CREATE TABLE posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      author_id INTEGER NOT NULL REFERENCES users(id),
      content TEXT,
      post_type TEXT DEFAULT 'update',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE post_destinations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      destination_type TEXT NOT NULL,
      destination_id INTEGER NOT NULL,
      UNIQUE(post_id, destination_type, destination_id)
    );
    CREATE TABLE post_pet_tags (
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
      PRIMARY KEY (post_id, pet_id)
    );
  `);
  db.prepare("INSERT INTO users (id, name, roles) VALUES (1, 'Jessica R', 'owner')").run();
  db.prepare("INSERT INTO users (id, name, roles) VALUES (2, 'Sarah M', 'owner,sitter')").run();
  db.prepare("INSERT INTO pets (id, owner_id, name, slug) VALUES (1, 1, 'Barkley', 'barkley')").run();
  db.prepare("INSERT INTO forum_categories (id, name, slug) VALUES (1, 'Sitter Lounge', 'sitter-lounge')").run();
  db.prepare("INSERT INTO forum_categories (id, name, slug) VALUES (2, 'General', 'general')").run();
  return db;
}

describe('cross-post flow', () => {
  let db: ReturnType<typeof Database>;
  beforeEach(() => { db = createTestDb(); });

  it('creates a post with profile destination by default', () => {
    const { lastInsertRowid } = db.prepare("INSERT INTO posts (author_id, content) VALUES (1, 'Hello')").run();
    db.prepare("INSERT INTO post_destinations (post_id, destination_type, destination_id) VALUES (?, 'profile', 1)").run(lastInsertRowid);
    const dests = db.prepare('SELECT * FROM post_destinations WHERE post_id = ?').all(lastInsertRowid);
    expect(dests).toHaveLength(1);
  });

  it('cross-posts to profile + pet + space in one action', () => {
    const { lastInsertRowid } = db.prepare("INSERT INTO posts (author_id, content) VALUES (1, 'Cross-post test')").run();
    db.prepare("INSERT INTO post_destinations (post_id, destination_type, destination_id) VALUES (?, 'profile', 1)").run(lastInsertRowid);
    db.prepare("INSERT INTO post_destinations (post_id, destination_type, destination_id) VALUES (?, 'pet', 1)").run(lastInsertRowid);
    db.prepare("INSERT INTO post_destinations (post_id, destination_type, destination_id) VALUES (?, 'space', 2)").run(lastInsertRowid);
    db.prepare("INSERT INTO post_pet_tags (post_id, pet_id) VALUES (?, 1)").run(lastInsertRowid);

    const dests = db.prepare('SELECT * FROM post_destinations WHERE post_id = ?').all(lastInsertRowid);
    expect(dests).toHaveLength(3);

    const tags = db.prepare('SELECT * FROM post_pet_tags WHERE post_id = ?').all(lastInsertRowid);
    expect(tags).toHaveLength(1);
  });

  it('post is stored once, appears in multiple destination queries', () => {
    const { lastInsertRowid } = db.prepare("INSERT INTO posts (author_id, content) VALUES (2, 'Walk photo')").run();
    db.prepare("INSERT INTO post_destinations (post_id, destination_type, destination_id) VALUES (?, 'profile', 2)").run(lastInsertRowid);
    db.prepare("INSERT INTO post_destinations (post_id, destination_type, destination_id) VALUES (?, 'pet', 1)").run(lastInsertRowid);
    db.prepare("INSERT INTO post_destinations (post_id, destination_type, destination_id) VALUES (?, 'space', 1)").run(lastInsertRowid);

    // Query by sitter profile
    const profilePosts = db.prepare(`
      SELECT p.* FROM posts p
      JOIN post_destinations pd ON pd.post_id = p.id
      WHERE pd.destination_type = 'profile' AND pd.destination_id = 2
    `).all();
    expect(profilePosts).toHaveLength(1);

    // Query by pet profile
    const petPosts = db.prepare(`
      SELECT p.* FROM posts p
      JOIN post_destinations pd ON pd.post_id = p.id
      WHERE pd.destination_type = 'pet' AND pd.destination_id = 1
    `).all();
    expect(petPosts).toHaveLength(1);

    // Query by community space
    const spacePosts = db.prepare(`
      SELECT p.* FROM posts p
      JOIN post_destinations pd ON pd.post_id = p.id
      WHERE pd.destination_type = 'space' AND pd.destination_id = 1
    `).all();
    expect(spacePosts).toHaveLength(1);

    // All three reference the same single post
    expect(db.prepare('SELECT COUNT(*) as count FROM posts').get()).toEqual({ count: 1 });
  });

  it('prevents duplicate destinations', () => {
    const { lastInsertRowid } = db.prepare("INSERT INTO posts (author_id, content) VALUES (1, 'Test')").run();
    db.prepare("INSERT INTO post_destinations (post_id, destination_type, destination_id) VALUES (?, 'profile', 1)").run(lastInsertRowid);
    expect(() => {
      db.prepare("INSERT INTO post_destinations (post_id, destination_type, destination_id) VALUES (?, 'profile', 1)").run(lastInsertRowid);
    }).toThrow(/UNIQUE/);
  });

  it('pet tag auto-suggests pet destination', () => {
    // Simulates the frontend logic: tagging a pet → auto-add pet destination
    const { lastInsertRowid } = db.prepare("INSERT INTO posts (author_id, content) VALUES (1, 'Barkley photo')").run();
    const petTagIds = [1];

    // Auto-add profile destination
    db.prepare("INSERT INTO post_destinations (post_id, destination_type, destination_id) VALUES (?, 'profile', 1)").run(lastInsertRowid);
    // Auto-add pet destination for each tagged pet
    for (const petId of petTagIds) {
      db.prepare("INSERT INTO post_destinations (post_id, destination_type, destination_id) VALUES (?, 'pet', ?)").run(lastInsertRowid, petId);
      db.prepare("INSERT INTO post_pet_tags (post_id, pet_id) VALUES (?, ?)").run(lastInsertRowid, petId);
    }

    const dests = db.prepare('SELECT destination_type FROM post_destinations WHERE post_id = ? ORDER BY destination_type').all(lastInsertRowid) as Array<{ destination_type: string }>;
    expect(dests.map(d => d.destination_type)).toEqual(['pet', 'profile']);
  });

  it('deleting post cascades to all destinations and tags', () => {
    const { lastInsertRowid } = db.prepare("INSERT INTO posts (author_id, content) VALUES (1, 'Temp')").run();
    db.prepare("INSERT INTO post_destinations (post_id, destination_type, destination_id) VALUES (?, 'profile', 1)").run(lastInsertRowid);
    db.prepare("INSERT INTO post_destinations (post_id, destination_type, destination_id) VALUES (?, 'space', 1)").run(lastInsertRowid);
    db.prepare("INSERT INTO post_pet_tags (post_id, pet_id) VALUES (?, 1)").run(lastInsertRowid);

    db.prepare('DELETE FROM posts WHERE id = ?').run(lastInsertRowid);

    expect(db.prepare('SELECT * FROM post_destinations WHERE post_id = ?').all(lastInsertRowid)).toHaveLength(0);
    expect(db.prepare('SELECT * FROM post_pet_tags WHERE post_id = ?').all(lastInsertRowid)).toHaveLength(0);
  });
});
