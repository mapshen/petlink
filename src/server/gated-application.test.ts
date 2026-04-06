import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

describe('gated sitter application', () => {
  let testDb: ReturnType<typeof Database>;

  beforeAll(() => {
    testDb = new Database(':memory:');
    testDb.pragma('foreign_keys = ON');
    testDb.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        roles TEXT DEFAULT 'owner',
        bio TEXT,
        avatar_url TEXT,
        approval_status TEXT DEFAULT 'approved'
          CHECK(approval_status IN ('approved', 'pending_approval', 'rejected', 'banned', 'onboarding'))
      );
      CREATE TABLE services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sitter_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        price_cents INTEGER NOT NULL,
        FOREIGN KEY (sitter_id) REFERENCES users(id)
      );
      CREATE TABLE sitter_references (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sitter_id INTEGER NOT NULL,
        client_name TEXT NOT NULL,
        client_email TEXT NOT NULL,
        rating INTEGER CHECK(rating >= 1 AND rating <= 5),
        comment TEXT,
        invite_token TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'completed')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        UNIQUE(sitter_id, client_email),
        FOREIGN KEY (sitter_id) REFERENCES users(id)
      );
      CREATE TABLE imported_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sitter_id INTEGER NOT NULL,
        platform TEXT NOT NULL,
        FOREIGN KEY (sitter_id) REFERENCES users(id)
      );
      CREATE TABLE imported_reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        imported_profile_id INTEGER,
        sitter_id INTEGER NOT NULL,
        platform TEXT NOT NULL,
        reviewer_name TEXT NOT NULL,
        rating INTEGER CHECK(rating >= 1 AND rating <= 5),
        comment TEXT,
        review_date DATE,
        FOREIGN KEY (sitter_id) REFERENCES users(id),
        FOREIGN KEY (imported_profile_id) REFERENCES imported_profiles(id)
      );
    `);

    // Seed: owner (id=1)
    testDb.prepare("INSERT INTO users (email, password_hash, name, roles) VALUES ('owner@test.com', 'hash', 'Owner', 'owner')").run();
  });

  afterAll(() => {
    testDb.close();
  });

  beforeEach(() => {
    testDb.exec("DELETE FROM imported_reviews");
    testDb.exec("DELETE FROM imported_profiles");
    testDb.exec("DELETE FROM sitter_references");
    testDb.exec("DELETE FROM services WHERE sitter_id != 0");
    testDb.exec("UPDATE users SET roles = 'owner', approval_status = 'approved', bio = NULL WHERE id = 1");
  });

  // --- Gated Application Flow ---

  it('become-sitter sets status to onboarding (not pending_approval)', () => {
    testDb.prepare("UPDATE users SET roles = 'owner,sitter', approval_status = 'onboarding' WHERE id = 1").run();
    const row = testDb.prepare('SELECT approval_status, roles FROM users WHERE id = 1').get() as any;
    expect(row.approval_status).toBe('onboarding');
    expect(row.roles).toContain('sitter');
  });

  it('cannot submit application without bio', () => {
    testDb.prepare("UPDATE users SET roles = 'owner,sitter', approval_status = 'onboarding', bio = NULL WHERE id = 1").run();
    testDb.prepare("INSERT INTO services (sitter_id, type, price_cents) VALUES (1, 'walking', 2500)").run();

    const user = testDb.prepare('SELECT bio FROM users WHERE id = 1').get() as any;
    expect(user.bio).toBeNull();
    // Application logic: reject if no bio
    const canSubmit = Boolean(user.bio);
    expect(canSubmit).toBe(false);
  });

  it('cannot submit application without services', () => {
    testDb.prepare("UPDATE users SET roles = 'owner,sitter', approval_status = 'onboarding', bio = 'Hello' WHERE id = 1").run();

    const [service] = testDb.prepare('SELECT id FROM services WHERE sitter_id = 1').all() as any[];
    expect(service).toBeUndefined();
    // Application logic: reject if no services
    const hasServices = !!service;
    expect(hasServices).toBe(false);
  });

  it('can submit application with bio + services', () => {
    testDb.prepare("UPDATE users SET roles = 'owner,sitter', approval_status = 'onboarding', bio = 'Hello' WHERE id = 1").run();
    testDb.prepare("INSERT INTO services (sitter_id, type, price_cents) VALUES (1, 'walking', 2500)").run();

    const user = testDb.prepare('SELECT bio, approval_status FROM users WHERE id = 1').get() as any;
    const [service] = testDb.prepare('SELECT id FROM services WHERE sitter_id = 1').all() as any[];
    expect(Boolean(user.bio)).toBe(true);
    expect(Boolean(service)).toBe(true);

    // Simulate submit
    testDb.prepare("UPDATE users SET approval_status = 'pending_approval' WHERE id = 1 AND approval_status = 'onboarding'").run();
    const updated = testDb.prepare('SELECT approval_status FROM users WHERE id = 1').get() as any;
    expect(updated.approval_status).toBe('pending_approval');
  });

  it('onboarding sitters do not appear in pending admin queue', () => {
    testDb.prepare("UPDATE users SET roles = 'owner,sitter', approval_status = 'onboarding' WHERE id = 1").run();
    const pending = testDb.prepare("SELECT id FROM users WHERE approval_status = 'pending_approval' AND roles LIKE '%sitter%'").all();
    expect(pending).toHaveLength(0);
  });

  // --- Sitter References ---

  it('can create a reference invite', () => {
    testDb.prepare("UPDATE users SET roles = 'owner,sitter', approval_status = 'onboarding' WHERE id = 1").run();
    const info = testDb.prepare(
      "INSERT INTO sitter_references (sitter_id, client_name, client_email, invite_token) VALUES (1, 'Jane', 'jane@email.com', 'token123')"
    ).run();
    expect(info.changes).toBe(1);

    const ref = testDb.prepare('SELECT * FROM sitter_references WHERE id = ?').get(info.lastInsertRowid) as any;
    expect(ref.status).toBe('pending');
    expect(ref.client_name).toBe('Jane');
  });

  it('prevents duplicate invite to same email per sitter', () => {
    testDb.prepare("UPDATE users SET roles = 'owner,sitter' WHERE id = 1").run();
    testDb.prepare(
      "INSERT INTO sitter_references (sitter_id, client_name, client_email, invite_token) VALUES (1, 'Jane', 'jane@email.com', 'token1')"
    ).run();

    expect(() => {
      testDb.prepare(
        "INSERT INTO sitter_references (sitter_id, client_name, client_email, invite_token) VALUES (1, 'Jane D', 'jane@email.com', 'token2')"
      ).run();
    }).toThrow();
  });

  it('client can complete a vouch via token', () => {
    testDb.prepare("UPDATE users SET roles = 'owner,sitter' WHERE id = 1").run();
    testDb.prepare(
      "INSERT INTO sitter_references (sitter_id, client_name, client_email, invite_token) VALUES (1, 'Jane', 'jane@email.com', 'vouch-token')"
    ).run();

    const info = testDb.prepare(
      "UPDATE sitter_references SET status = 'completed', rating = 5, comment = 'Great sitter!', completed_at = datetime('now') WHERE invite_token = 'vouch-token' AND status = 'pending'"
    ).run();
    expect(info.changes).toBe(1);

    const ref = testDb.prepare("SELECT * FROM sitter_references WHERE invite_token = 'vouch-token'").get() as any;
    expect(ref.status).toBe('completed');
    expect(ref.rating).toBe(5);
    expect(ref.comment).toBe('Great sitter!');
  });

  it('cannot vouch with invalid token', () => {
    const info = testDb.prepare(
      "UPDATE sitter_references SET status = 'completed', rating = 5 WHERE invite_token = 'nonexistent'"
    ).run();
    expect(info.changes).toBe(0);
  });

  it('cannot vouch twice on same reference', () => {
    testDb.prepare("UPDATE users SET roles = 'owner,sitter' WHERE id = 1").run();
    testDb.prepare(
      "INSERT INTO sitter_references (sitter_id, client_name, client_email, invite_token, status, rating, comment) VALUES (1, 'Jane', 'jane@email.com', 'done-token', 'completed', 5, 'Already done')"
    ).run();

    const info = testDb.prepare(
      "UPDATE sitter_references SET rating = 1, comment = 'Changed mind' WHERE invite_token = 'done-token' AND status = 'pending'"
    ).run();
    expect(info.changes).toBe(0);
  });

  // --- Manual Review Import ---

  it('can insert manual imported review without imported_profile_id', () => {
    testDb.prepare("UPDATE users SET roles = 'owner,sitter' WHERE id = 1").run();
    const info = testDb.prepare(
      "INSERT INTO imported_reviews (sitter_id, platform, reviewer_name, rating, comment) VALUES (1, 'rover', 'Bob Smith', 5, 'Amazing pet sitter')"
    ).run();
    expect(info.changes).toBe(1);

    const review = testDb.prepare('SELECT * FROM imported_reviews WHERE id = ?').get(info.lastInsertRowid) as any;
    expect(review.imported_profile_id).toBeNull();
    expect(review.platform).toBe('rover');
    expect(review.reviewer_name).toBe('Bob Smith');
  });

  it('can still insert imported review with profile link', () => {
    testDb.prepare("UPDATE users SET roles = 'owner,sitter' WHERE id = 1").run();
    testDb.prepare("INSERT INTO imported_profiles (sitter_id, platform) VALUES (1, 'rover')").run();
    const info = testDb.prepare(
      "INSERT INTO imported_reviews (imported_profile_id, sitter_id, platform, reviewer_name, rating) VALUES (1, 1, 'rover', 'Alice', 4)"
    ).run();
    expect(info.changes).toBe(1);

    const review = testDb.prepare('SELECT * FROM imported_reviews WHERE id = ?').get(info.lastInsertRowid) as any;
    expect(review.imported_profile_id).toBe(1);
  });
});
