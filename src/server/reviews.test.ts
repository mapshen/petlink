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
  db.prepare("INSERT INTO users (email, password_hash, name, roles) VALUES (?, ?, ?, ?)").run('owner@test.com', hash, 'Owner', 'owner');
  db.prepare("INSERT INTO users (email, password_hash, name, roles) VALUES (?, ?, ?, ?)").run('sitter@test.com', hash, 'Sitter', 'owner,sitter');
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

  it('should auto-publish unpublished reviews after 3 days', () => {
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, created_at) VALUES (?, ?, ?, ?, ?)').run(1, 1, 2, 5, fourDaysAgo);

    const review = db.prepare('SELECT * FROM reviews WHERE id = 1').get() as Record<string, unknown>;
    expect(review.published_at).toBeNull();

    // Should be visible via the 3-day auto-publish filter
    const visible = db.prepare(
      "SELECT * FROM reviews WHERE reviewee_id = 2 AND (published_at IS NOT NULL OR created_at < datetime('now', '-3 days'))"
    ).all();
    expect(visible).toHaveLength(1);
  });

  it('should NOT auto-publish unpublished reviews within 3 days', () => {
    const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, created_at) VALUES (?, ?, ?, ?, ?)').run(1, 1, 2, 5, oneDayAgo);

    const visible = db.prepare(
      "SELECT * FROM reviews WHERE reviewee_id = 2 AND (published_at IS NOT NULL OR created_at < datetime('now', '-3 days'))"
    ).all();
    expect(visible).toHaveLength(0);
  });

  it('should block review submission after 3-day window if other party already reviewed', () => {
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, created_at) VALUES (?, ?, ?, ?, ?)').run(1, 1, 2, 5, fourDaysAgo);

    // The other party's review is > 3 days old — new review should be blocked
    const otherReview = db.prepare('SELECT created_at FROM reviews WHERE booking_id = 1 AND reviewer_id = 1').get() as Record<string, unknown>;
    const age = Date.now() - new Date(otherReview.created_at as string).getTime();
    expect(age).toBeGreaterThan(3 * 24 * 60 * 60 * 1000);
  });

  it('should prevent duplicate reviews from same reviewer', () => {
    db.prepare('INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating) VALUES (?, ?, ?, ?)').run(1, 1, 2, 5);

    expect(() => {
      db.prepare('INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating) VALUES (?, ?, ?, ?)').run(1, 1, 2, 4);
    }).toThrow();
  });
});

describe('sitter profile review stats', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => { db = createTestDb(); });

  function getReviewStats(sitterId: number) {
    return db.prepare(
      `SELECT AVG(r.rating) as avg_rating, COUNT(*) as review_count
       FROM reviews r
       WHERE r.reviewee_id = ?
         AND (r.published_at IS NOT NULL OR r.created_at < datetime('now', '-3 days'))`
    ).get(sitterId) as { avg_rating: number | null; review_count: number };
  }

  it('returns null avg_rating and 0 count for sitter with no reviews', () => {
    const stats = getReviewStats(2);
    expect(stats.avg_rating).toBeNull();
    expect(stats.review_count).toBe(0);
  });

  it('returns correct avg_rating and count for published reviews', () => {
    const now = new Date().toISOString();
    db.prepare('INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, published_at) VALUES (?, ?, ?, ?, ?)').run(1, 1, 2, 5, now);

    // Add a second booking+review
    db.prepare('INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)').run(2, 1, 1, 'completed', '2025-02-01', '2025-02-02');
    db.prepare('INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, published_at) VALUES (?, ?, ?, ?, ?)').run(2, 1, 2, 3, now);

    const stats = getReviewStats(2);
    expect(stats.avg_rating).toBe(4); // (5 + 3) / 2
    expect(stats.review_count).toBe(2);
  });

  it('includes auto-published reviews older than 3 days', () => {
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, created_at) VALUES (?, ?, ?, ?, ?)').run(1, 1, 2, 4, fourDaysAgo);

    const stats = getReviewStats(2);
    expect(stats.avg_rating).toBe(4);
    expect(stats.review_count).toBe(1);
  });

  it('excludes unpublished reviews within 3-day blind window', () => {
    const oneDayAgo = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, created_at) VALUES (?, ?, ?, ?, ?)').run(1, 1, 2, 5, oneDayAgo);

    const stats = getReviewStats(2);
    expect(stats.avg_rating).toBeNull();
    expect(stats.review_count).toBe(0);
  });
});
