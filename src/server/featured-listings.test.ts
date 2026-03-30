import { describe, it, expect, beforeEach } from 'vitest';
import { featuredListingSchema } from './validation.ts';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

describe('featuredListingSchema', () => {
  it('accepts valid listing with service type', () => {
    expect(featuredListingSchema.safeParse({ service_type: 'walking' }).success).toBe(true);
  });

  it('accepts listing without service type (all services)', () => {
    expect(featuredListingSchema.safeParse({}).success).toBe(true);
  });

  it('rejects invalid service type', () => {
    expect(featuredListingSchema.safeParse({ service_type: 'magic' }).success).toBe(false);
  });

  it('accepts all valid service types', () => {
    for (const type of ['walking', 'sitting', 'drop-in', 'grooming', 'meet_greet']) {
      expect(featuredListingSchema.safeParse({ service_type: type }).success).toBe(true);
    }
  });
});

describe('featured_listings table', () => {
  function createTestDb() {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, name TEXT NOT NULL, roles TEXT DEFAULT 'owner,sitter');
      CREATE TABLE featured_listings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sitter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        service_type TEXT,
        commission_rate REAL NOT NULL DEFAULT 0.15,
        active INTEGER DEFAULT 1,
        impressions INTEGER DEFAULT 0,
        clicks INTEGER DEFAULT 0,
        bookings_from_promotion INTEGER DEFAULT 0,
        commission_earned_cents INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(sitter_id, service_type)
      );
    `);
    const hash = bcrypt.hashSync('pass', 10);
    db.prepare("INSERT INTO users (email, password_hash, name, roles) VALUES (?, ?, ?, ?)").run('sitter@test.com', hash, 'Sitter', 'owner,sitter');
    return db;
  }

  let db: ReturnType<typeof createTestDb>;
  beforeEach(() => { db = createTestDb(); });

  it('creates a featured listing with default commission rate', () => {
    db.prepare("INSERT INTO featured_listings (sitter_id, service_type) VALUES (?, ?)").run(1, 'walking');
    const listing = db.prepare('SELECT * FROM featured_listings WHERE sitter_id = 1').get() as Record<string, unknown>;
    expect(listing.service_type).toBe('walking');
    expect(listing.commission_rate).toBe(0.15);
    expect(listing.active).toBe(1);
    expect(listing.impressions).toBe(0);
    expect(listing.bookings_from_promotion).toBe(0);
  });

  it('tracks analytics fields', () => {
    db.prepare("INSERT INTO featured_listings (sitter_id, service_type) VALUES (?, ?)").run(1, 'walking');
    db.prepare("UPDATE featured_listings SET impressions = 100, clicks = 15, bookings_from_promotion = 3, commission_earned_cents = 1575 WHERE id = 1").run();
    const listing = db.prepare('SELECT * FROM featured_listings WHERE id = 1').get() as Record<string, unknown>;
    expect(listing.impressions).toBe(100);
    expect(listing.clicks).toBe(15);
    expect(listing.bookings_from_promotion).toBe(3);
    expect(listing.commission_earned_cents).toBe(1575);
  });

  it('enforces unique constraint on sitter_id + service_type', () => {
    db.prepare("INSERT INTO featured_listings (sitter_id, service_type) VALUES (?, ?)").run(1, 'walking');
    expect(() => {
      db.prepare("INSERT INTO featured_listings (sitter_id, service_type) VALUES (?, ?)").run(1, 'walking');
    }).toThrow();
  });

  it('allows different service types for same sitter', () => {
    db.prepare("INSERT INTO featured_listings (sitter_id, service_type) VALUES (?, ?)").run(1, 'walking');
    db.prepare("INSERT INTO featured_listings (sitter_id, service_type) VALUES (?, ?)").run(1, 'sitting');
    expect(db.prepare('SELECT * FROM featured_listings WHERE sitter_id = 1').all()).toHaveLength(2);
  });

  it('cascades delete when sitter is deleted', () => {
    db.prepare("INSERT INTO featured_listings (sitter_id, service_type) VALUES (?, ?)").run(1, 'walking');
    db.prepare('DELETE FROM users WHERE id = 1').run();
    expect(db.prepare('SELECT * FROM featured_listings').all()).toHaveLength(0);
  });
});
