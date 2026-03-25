import { describe, it, expect, beforeEach } from 'vitest';
import { featuredListingSchema } from './validation.ts';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

describe('featuredListingSchema', () => {
  it('accepts valid listing with service type', () => {
    expect(featuredListingSchema.safeParse({ service_type: 'walking', daily_budget_cents: 500 }).success).toBe(true);
  });

  it('accepts listing without service type (all services)', () => {
    expect(featuredListingSchema.safeParse({ daily_budget_cents: 1000 }).success).toBe(true);
  });

  it('rejects budget below $1/day (100 cents)', () => {
    expect(featuredListingSchema.safeParse({ daily_budget_cents: 50 }).success).toBe(false);
  });

  it('rejects budget above $1000/day', () => {
    expect(featuredListingSchema.safeParse({ daily_budget_cents: 100001 }).success).toBe(false);
  });

  it('rejects invalid service type', () => {
    expect(featuredListingSchema.safeParse({ service_type: 'magic', daily_budget_cents: 500 }).success).toBe(false);
  });
});

describe('featured_listings table', () => {
  function createTestDb() {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, name TEXT NOT NULL, role TEXT DEFAULT 'sitter');
      CREATE TABLE featured_listings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sitter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        service_type TEXT,
        budget_cents INTEGER DEFAULT 0,
        daily_budget_cents INTEGER DEFAULT 500,
        spent_cents INTEGER DEFAULT 0,
        active INTEGER DEFAULT 1,
        starts_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        ends_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(sitter_id, service_type)
      );
    `);
    const hash = bcrypt.hashSync('pass', 10);
    db.prepare("INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)").run('sitter@test.com', hash, 'Sitter', 'sitter');
    return db;
  }

  let db: ReturnType<typeof createTestDb>;
  beforeEach(() => { db = createTestDb(); });

  it('creates a featured listing', () => {
    db.prepare("INSERT INTO featured_listings (sitter_id, service_type, daily_budget_cents) VALUES (?, ?, ?)").run(1, 'walking', 500);
    const listing = db.prepare('SELECT * FROM featured_listings WHERE sitter_id = 1').get() as Record<string, unknown>;
    expect(listing.service_type).toBe('walking');
    expect(listing.daily_budget_cents).toBe(500);
    expect(listing.active).toBe(1);
  });

  it('enforces unique constraint on sitter_id + service_type', () => {
    db.prepare("INSERT INTO featured_listings (sitter_id, service_type, daily_budget_cents) VALUES (?, ?, ?)").run(1, 'walking', 500);
    expect(() => {
      db.prepare("INSERT INTO featured_listings (sitter_id, service_type, daily_budget_cents) VALUES (?, ?, ?)").run(1, 'walking', 1000);
    }).toThrow();
  });

  it('allows different service types for same sitter', () => {
    db.prepare("INSERT INTO featured_listings (sitter_id, service_type, daily_budget_cents) VALUES (?, ?, ?)").run(1, 'walking', 500);
    db.prepare("INSERT INTO featured_listings (sitter_id, service_type, daily_budget_cents) VALUES (?, ?, ?)").run(1, 'sitting', 800);
    expect(db.prepare('SELECT * FROM featured_listings WHERE sitter_id = 1').all()).toHaveLength(2);
  });

  it('cascades delete when sitter is deleted', () => {
    db.prepare("INSERT INTO featured_listings (sitter_id, service_type, daily_budget_cents) VALUES (?, ?, ?)").run(1, 'walking', 500);
    db.prepare('DELETE FROM users WHERE id = 1').run();
    expect(db.prepare('SELECT * FROM featured_listings').all()).toHaveLength(0);
  });
});
