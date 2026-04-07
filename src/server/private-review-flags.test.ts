import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { PRIVATE_FLAG_VALUES, createReviewSchema } from './validation.ts';

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
      approval_status TEXT DEFAULT 'approved',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sitter_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      price_cents INTEGER NOT NULL,
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
      total_price_cents INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL,
      reviewer_id INTEGER NOT NULL,
      reviewee_id INTEGER NOT NULL,
      rating INTEGER CHECK(rating >= 1 AND rating <= 5),
      comment TEXT,
      pet_care_rating INTEGER CHECK(pet_care_rating >= 1 AND pet_care_rating <= 5),
      communication_rating INTEGER CHECK(communication_rating >= 1 AND communication_rating <= 5),
      reliability_rating INTEGER CHECK(reliability_rating >= 1 AND reliability_rating <= 5),
      pet_accuracy_rating INTEGER CHECK(pet_accuracy_rating >= 1 AND pet_accuracy_rating <= 5),
      preparedness_rating INTEGER CHECK(preparedness_rating >= 1 AND preparedness_rating <= 5),
      response_text TEXT,
      response_at DATETIME,
      published_at DATETIME,
      hidden_at DATETIME,
      hidden_by INTEGER REFERENCES users(id),
      private_flags TEXT DEFAULT '',
      private_note TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(booking_id, reviewer_id)
    );
  `);

  const hash = bcrypt.hashSync('pass', 10);
  db.prepare("INSERT INTO users (email, password_hash, name, roles) VALUES (?, ?, ?, ?)").run('owner@test.com', hash, 'Owner', 'owner');
  db.prepare("INSERT INTO users (email, password_hash, name, roles) VALUES (?, ?, ?, ?)").run('sitter@test.com', hash, 'Sitter', 'owner,sitter');
  db.prepare("INSERT INTO users (email, password_hash, name, roles) VALUES (?, ?, ?, ?)").run('admin@test.com', hash, 'Admin', 'owner,admin');
  db.prepare("INSERT INTO services (sitter_id, type, price_cents) VALUES (?, ?, ?)").run(2, 'walking', 2500);
  db.prepare("INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)").run(2, 1, 1, 'completed', '2025-01-01', '2025-01-02');

  return db;
}

describe('private review flags — schema', () => {
  let db: ReturnType<typeof createTestDb>;
  beforeEach(() => { db = createTestDb(); });

  it('stores private_flags as a text column (serialized)', () => {
    const flags = 'safety_concern,pet_behavior';
    db.prepare('INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, private_flags) VALUES (?, ?, ?, ?, ?)').run(1, 1, 2, 5, flags);

    const review = db.prepare('SELECT private_flags FROM reviews WHERE id = 1').get() as Record<string, unknown>;
    expect(review.private_flags).toBe('safety_concern,pet_behavior');
  });

  it('stores private_note alongside flags', () => {
    db.prepare('INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, private_flags, private_note) VALUES (?, ?, ?, ?, ?, ?)').run(
      1, 1, 2, 4, 'cleanliness', 'House was not clean'
    );

    const review = db.prepare('SELECT private_flags, private_note FROM reviews WHERE id = 1').get() as Record<string, unknown>;
    expect(review.private_flags).toBe('cleanliness');
    expect(review.private_note).toBe('House was not clean');
  });

  it('defaults to empty string for private_flags', () => {
    db.prepare('INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating) VALUES (?, ?, ?, ?)').run(1, 1, 2, 5);

    const review = db.prepare('SELECT private_flags, private_note FROM reviews WHERE id = 1').get() as Record<string, unknown>;
    expect(review.private_flags).toBe('');
    expect(review.private_note).toBeNull();
  });

  it('stores multiple flags', () => {
    const flags = 'safety_concern,communication_issue,no_show_concern';
    db.prepare('INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, private_flags) VALUES (?, ?, ?, ?, ?)').run(1, 1, 2, 3, flags);

    const review = db.prepare('SELECT private_flags FROM reviews WHERE id = 1').get() as Record<string, unknown>;
    const storedFlags = (review.private_flags as string).split(',');
    expect(storedFlags).toHaveLength(3);
    expect(storedFlags).toContain('safety_concern');
    expect(storedFlags).toContain('communication_issue');
    expect(storedFlags).toContain('no_show_concern');
  });
});

describe('private review flags — validation', () => {
  it('accepts valid private_flags array', () => {
    const result = createReviewSchema.safeParse({
      booking_id: 1,
      rating: 5,
      private_flags: ['safety_concern', 'pet_behavior'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.private_flags).toEqual(['safety_concern', 'pet_behavior']);
    }
  });

  it('accepts empty private_flags', () => {
    const result = createReviewSchema.safeParse({
      booking_id: 1,
      rating: 5,
      private_flags: [],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.private_flags).toEqual([]);
    }
  });

  it('defaults private_flags to empty array when omitted', () => {
    const result = createReviewSchema.safeParse({
      booking_id: 1,
      rating: 4,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.private_flags).toEqual([]);
    }
  });

  it('rejects invalid flag values', () => {
    const result = createReviewSchema.safeParse({
      booking_id: 1,
      rating: 5,
      private_flags: ['invalid_flag'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects more than 6 flags', () => {
    const result = createReviewSchema.safeParse({
      booking_id: 1,
      rating: 5,
      private_flags: [
        'safety_concern', 'pet_behavior', 'communication_issue',
        'accuracy_issue', 'cleanliness', 'no_show_concern', 'safety_concern',
      ],
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid private_note', () => {
    const result = createReviewSchema.safeParse({
      booking_id: 1,
      rating: 5,
      private_note: 'Sitter seemed unprofessional',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.private_note).toBe('Sitter seemed unprofessional');
    }
  });

  it('rejects private_note over 1000 characters', () => {
    const result = createReviewSchema.safeParse({
      booking_id: 1,
      rating: 5,
      private_note: 'x'.repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it('accepts null private_note', () => {
    const result = createReviewSchema.safeParse({
      booking_id: 1,
      rating: 5,
      private_note: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.private_note).toBeNull();
    }
  });

  it('exports the allowed flag values constant', () => {
    expect(PRIVATE_FLAG_VALUES).toEqual([
      'safety_concern', 'pet_behavior', 'communication_issue',
      'accuracy_issue', 'cleanliness', 'no_show_concern',
    ]);
  });

  it('accepts all 6 valid flag values at once', () => {
    const result = createReviewSchema.safeParse({
      booking_id: 1,
      rating: 5,
      private_flags: [...PRIVATE_FLAG_VALUES],
    });
    expect(result.success).toBe(true);
  });
});

describe('private review flags — admin queries', () => {
  let db: ReturnType<typeof createTestDb>;
  beforeEach(() => { db = createTestDb(); });

  it('admin query includes private_flags and private_note', () => {
    const now = new Date().toISOString();
    db.prepare('INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, comment, published_at, private_flags, private_note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(
      1, 1, 2, 3, 'Concerning experience', now, 'safety_concern,pet_behavior', 'Dog was aggressive'
    );

    const review = db.prepare(`
      SELECT r.*, reviewer.name as reviewer_name, reviewee.name as reviewee_name
      FROM reviews r
      JOIN users reviewer ON r.reviewer_id = reviewer.id
      JOIN users reviewee ON r.reviewee_id = reviewee.id
      WHERE r.id = 1
    `).get() as Record<string, unknown>;

    expect(review.private_flags).toBe('safety_concern,pet_behavior');
    expect(review.private_note).toBe('Dog was aggressive');
    expect(review.reviewer_name).toBe('Owner');
  });

  it('can filter reviews with private flags (flagged queue)', () => {
    const now = new Date().toISOString();
    // Review with flags
    db.prepare('INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, published_at, private_flags) VALUES (?, ?, ?, ?, ?, ?)').run(
      1, 1, 2, 3, now, 'safety_concern'
    );
    // Review without flags (second booking)
    db.prepare("INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)").run(2, 1, 1, 'completed', '2025-02-01', '2025-02-02');
    db.prepare('INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, published_at) VALUES (?, ?, ?, ?, ?)').run(
      2, 1, 2, 5, now
    );

    // Query flagged reviews (simulating PostgreSQL array_length > 0 with SQLite text check)
    const flagged = db.prepare(
      "SELECT * FROM reviews WHERE private_flags != '' AND private_flags IS NOT NULL"
    ).all() as Record<string, unknown>[];

    expect(flagged).toHaveLength(1);
    expect(flagged[0].rating).toBe(3);
    expect(flagged[0].private_flags).toBe('safety_concern');
  });

  it('private flags are NOT included in public review queries (logic test)', () => {
    const now = new Date().toISOString();
    db.prepare('INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, published_at, private_flags, private_note) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      1, 1, 2, 4, now, 'accuracy_issue', 'Description was inaccurate'
    );

    // Public query — simulate stripping private fields
    const review = db.prepare(
      "SELECT id, booking_id, reviewer_id, reviewee_id, rating, comment, published_at, created_at FROM reviews WHERE reviewee_id = 2 AND hidden_at IS NULL AND (published_at IS NOT NULL OR created_at < datetime('now', '-3 days'))"
    ).get() as Record<string, unknown>;

    expect(review).toBeDefined();
    expect(review.rating).toBe(4);
    // When selecting specific columns, private_flags should not be included
    expect(review).not.toHaveProperty('private_flags');
    expect(review).not.toHaveProperty('private_note');
  });
});

describe('private review flags — edge cases', () => {
  it('trims whitespace from private_note', () => {
    const result = createReviewSchema.safeParse({
      booking_id: 1,
      rating: 5,
      private_note: '  some note  ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.private_note).toBe('some note');
    }
  });

  it('allows review with flags but no note', () => {
    const result = createReviewSchema.safeParse({
      booking_id: 1,
      rating: 3,
      private_flags: ['cleanliness'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.private_flags).toEqual(['cleanliness']);
      expect(result.data.private_note).toBeUndefined();
    }
  });

  it('allows note without flags', () => {
    const result = createReviewSchema.safeParse({
      booking_id: 1,
      rating: 4,
      private_note: 'General concern',
      private_flags: [],
    });
    expect(result.success).toBe(true);
  });
});
