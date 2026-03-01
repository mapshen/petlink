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
      role TEXT DEFAULT 'owner',
      bio TEXT, avatar_url TEXT, lat REAL, lng REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sitter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, sitter_id),
      CHECK(user_id != sitter_id)
    );
  `);

  const hash = bcrypt.hashSync('pass', 10);
  db.prepare("INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)").run('owner@test.com', hash, 'Owner', 'owner');
  db.prepare("INSERT INTO users (email, password_hash, name, role, bio, avatar_url) VALUES (?, ?, ?, ?, ?, ?)").run('sitter@test.com', hash, 'Sitter', 'sitter', 'I love dogs', 'https://example.com/sitter.jpg');
  db.prepare("INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)").run('sitter2@test.com', hash, 'Sitter2', 'both');

  return db;
}

describe('favorites', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => { db = createTestDb(); });

  it('should add a favorite', () => {
    db.prepare('INSERT INTO favorites (user_id, sitter_id) VALUES (?, ?)').run(1, 2);
    const fav = db.prepare('SELECT * FROM favorites WHERE user_id = 1 AND sitter_id = 2').get() as Record<string, unknown>;
    expect(fav).toBeDefined();
    expect(fav.user_id).toBe(1);
    expect(fav.sitter_id).toBe(2);
  });

  it('should prevent duplicate favorites (unique constraint)', () => {
    db.prepare('INSERT INTO favorites (user_id, sitter_id) VALUES (?, ?)').run(1, 2);
    expect(() => {
      db.prepare('INSERT INTO favorites (user_id, sitter_id) VALUES (?, ?)').run(1, 2);
    }).toThrow();
  });

  it('should prevent self-favoriting (check constraint)', () => {
    expect(() => {
      db.prepare('INSERT INTO favorites (user_id, sitter_id) VALUES (?, ?)').run(1, 1);
    }).toThrow();
  });

  it('should delete a favorite', () => {
    db.prepare('INSERT INTO favorites (user_id, sitter_id) VALUES (?, ?)').run(1, 2);
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND sitter_id = ?').run(1, 2);
    const fav = db.prepare('SELECT * FROM favorites WHERE user_id = 1 AND sitter_id = 2').get();
    expect(fav).toBeUndefined();
  });

  it('should list favorites for a user', () => {
    db.prepare('INSERT INTO favorites (user_id, sitter_id) VALUES (?, ?)').run(1, 2);
    db.prepare('INSERT INTO favorites (user_id, sitter_id) VALUES (?, ?)').run(1, 3);
    const favs = db.prepare('SELECT * FROM favorites WHERE user_id = ?').all(1) as Record<string, unknown>[];
    expect(favs).toHaveLength(2);
  });

  it('should join with user data for listing', () => {
    db.prepare('INSERT INTO favorites (user_id, sitter_id) VALUES (?, ?)').run(1, 2);
    const [fav] = db.prepare(`
      SELECT f.id, f.sitter_id, f.created_at,
             u.name as sitter_name, u.avatar_url as sitter_avatar, u.bio as sitter_bio
      FROM favorites f
      JOIN users u ON f.sitter_id = u.id
      WHERE f.user_id = ?
    `).all(1) as Record<string, unknown>[];
    expect(fav.sitter_name).toBe('Sitter');
    expect(fav.sitter_avatar).toBe('https://example.com/sitter.jpg');
    expect(fav.sitter_bio).toBe('I love dogs');
  });

  it('should cascade delete when user is deleted', () => {
    db.prepare('INSERT INTO favorites (user_id, sitter_id) VALUES (?, ?)').run(1, 2);
    db.prepare('DELETE FROM users WHERE id = ?').run(1);
    const favs = db.prepare('SELECT * FROM favorites WHERE user_id = 1').all();
    expect(favs).toHaveLength(0);
  });

  it('should cascade delete when sitter is deleted', () => {
    db.prepare('INSERT INTO favorites (user_id, sitter_id) VALUES (?, ?)').run(1, 2);
    db.prepare('DELETE FROM users WHERE id = ?').run(2);
    const favs = db.prepare('SELECT * FROM favorites WHERE sitter_id = 2').all();
    expect(favs).toHaveLength(0);
  });

  it('should not affect other users favorites on delete', () => {
    db.prepare('INSERT INTO favorites (user_id, sitter_id) VALUES (?, ?)').run(1, 2);
    db.prepare('INSERT INTO favorites (user_id, sitter_id) VALUES (?, ?)').run(1, 3);
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND sitter_id = ?').run(1, 2);
    const favs = db.prepare('SELECT * FROM favorites WHERE user_id = ?').all(1) as Record<string, unknown>[];
    expect(favs).toHaveLength(1);
    expect(favs[0].sitter_id).toBe(3);
  });
});
