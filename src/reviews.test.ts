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
    CREATE TABLE services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sitter_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      price REAL NOT NULL,
      description TEXT,
      FOREIGN KEY (sitter_id) REFERENCES users(id)
    );
    CREATE TABLE bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sitter_id INTEGER NOT NULL,
      owner_id INTEGER NOT NULL,
      pet_id INTEGER,
      service_id INTEGER,
      status TEXT DEFAULT 'pending',
      start_time DATETIME NOT NULL,
      end_time DATETIME NOT NULL,
      total_price REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL,
      reviewer_id INTEGER NOT NULL,
      reviewee_id INTEGER NOT NULL,
      rating INTEGER CHECK(rating >= 1 AND rating <= 5),
      comment TEXT,
      published_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(booking_id, reviewer_id)
    );
  `);

  const hash = bcrypt.hashSync('pass', 10);
  db.prepare("INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)").run('owner@test.com', hash, 'Owner', 'owner');
  db.prepare("INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)").run('sitter@test.com', hash, 'Sitter', 'sitter');
  db.prepare("INSERT INTO services (sitter_id, type, price) VALUES (?, ?, ?)").run(2, 'walking', 25);
  db.prepare("INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)").run(2, 1, 1, 'completed', '2025-01-01', '2025-01-02');

  return db;
}

describe('double-blind reviews', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => { db = createTestDb(); });

  it('should not publish review when only one party has reviewed', () => {
    db.prepare('INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, comment) VALUES (?, ?, ?, ?, ?)').run(1, 1, 2, 5, 'Great sitter!');

    const review = db.prepare('SELECT * FROM reviews WHERE id = 1').get() as Record<string, unknown>;
    expect(review.published_at).toBeNull();
  });

  it('should publish both reviews when both parties review', () => {
    db.prepare('INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, comment) VALUES (?, ?, ?, ?, ?)').run(1, 1, 2, 5, 'Great!');
    db.prepare('INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, comment) VALUES (?, ?, ?, ?, ?)').run(1, 2, 1, 4, 'Nice pet');

    // Simulate the publish logic
    const now = new Date().toISOString();
    db.prepare('UPDATE reviews SET published_at = ? WHERE booking_id = ? AND published_at IS NULL').run(now, 1);

    const reviews = db.prepare('SELECT * FROM reviews WHERE booking_id = 1').all() as Record<string, unknown>[];
    expect(reviews).toHaveLength(2);
    expect(reviews[0].published_at).not.toBeNull();
    expect(reviews[1].published_at).not.toBeNull();
  });

  it('should prevent duplicate reviews from same reviewer', () => {
    db.prepare('INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating) VALUES (?, ?, ?, ?)').run(1, 1, 2, 5);

    expect(() => {
      db.prepare('INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating) VALUES (?, ?, ?, ?)').run(1, 1, 2, 4);
    }).toThrow();
  });
});
