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
      role TEXT DEFAULT 'sitter',
      subscription_tier TEXT DEFAULT 'free'
    );
    CREATE TABLE sitter_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sitter_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      tier TEXT NOT NULL DEFAULT 'free',
      stripe_subscription_id TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      current_period_start TEXT,
      current_period_end TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
  const hash = bcrypt.hashSync('pass', 10);
  db.prepare("INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)").run('sitter@test.com', hash, 'Sitter', 'sitter');
  return db;
}

describe('sitter subscriptions', () => {
  let db: ReturnType<typeof createTestDb>;
  beforeEach(() => { db = createTestDb(); });

  it('creates a Pro subscription', () => {
    db.prepare("INSERT INTO sitter_subscriptions (sitter_id, tier, status) VALUES (?, ?, ?)").run(1, 'pro', 'active');
    db.prepare("UPDATE users SET subscription_tier = 'pro' WHERE id = 1").run();

    const sub = db.prepare('SELECT * FROM sitter_subscriptions WHERE sitter_id = 1').get() as Record<string, unknown>;
    expect(sub.tier).toBe('pro');
    expect(sub.status).toBe('active');

    const user = db.prepare('SELECT subscription_tier FROM users WHERE id = 1').get() as Record<string, unknown>;
    expect(user.subscription_tier).toBe('pro');
  });

  it('enforces unique subscription per sitter', () => {
    db.prepare("INSERT INTO sitter_subscriptions (sitter_id, tier, status) VALUES (?, ?, ?)").run(1, 'pro', 'active');
    expect(() => {
      db.prepare("INSERT INTO sitter_subscriptions (sitter_id, tier, status) VALUES (?, ?, ?)").run(1, 'pro', 'active');
    }).toThrow();
  });

  it('cancels subscription', () => {
    db.prepare("INSERT INTO sitter_subscriptions (sitter_id, tier, status) VALUES (?, ?, ?)").run(1, 'pro', 'active');
    db.prepare("UPDATE sitter_subscriptions SET tier = 'free', status = 'cancelled' WHERE sitter_id = 1").run();
    db.prepare("UPDATE users SET subscription_tier = 'free' WHERE id = 1").run();

    const sub = db.prepare('SELECT * FROM sitter_subscriptions WHERE sitter_id = 1').get() as Record<string, unknown>;
    expect(sub.tier).toBe('free');
    expect(sub.status).toBe('cancelled');
  });

  it('cascades delete when sitter is deleted', () => {
    db.prepare("INSERT INTO sitter_subscriptions (sitter_id, tier, status) VALUES (?, ?, ?)").run(1, 'pro', 'active');
    db.prepare('DELETE FROM users WHERE id = 1').run();
    expect(db.prepare('SELECT * FROM sitter_subscriptions').all()).toHaveLength(0);
  });

  it('defaults user subscription_tier to free', () => {
    const user = db.prepare('SELECT subscription_tier FROM users WHERE id = 1').get() as Record<string, unknown>;
    expect(user.subscription_tier).toBe('free');
  });
});
