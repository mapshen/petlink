import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { importedProfileSchema } from './validation.ts';

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
    CREATE TABLE imported_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      profile_url TEXT NOT NULL,
      display_name TEXT,
      review_count INTEGER,
      avg_rating REAL,
      verified INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, platform)
    );
  `);

  const hash = bcrypt.hashSync('pass', 10);
  db.prepare("INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)").run('sitter@test.com', hash, 'Sitter', 'sitter');
  db.prepare("INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)").run('sitter2@test.com', hash, 'Sitter2', 'both');

  return db;
}

// --- Schema Validation Tests ---

describe('importedProfileSchema', () => {
  it('accepts valid imported profile data', () => {
    const result = importedProfileSchema.safeParse({
      platform: 'rover',
      profile_url: 'https://www.rover.com/members/john/',
      display_name: 'John D.',
      review_count: 42,
      avg_rating: 4.8,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.platform).toBe('rover');
      expect(result.data.profile_url).toBe('https://www.rover.com/members/john/');
      expect(result.data.display_name).toBe('John D.');
      expect(result.data.review_count).toBe(42);
      expect(result.data.avg_rating).toBe(4.8);
    }
  });

  it('accepts all valid platform values', () => {
    for (const platform of ['rover', 'wag', 'care_com', 'other']) {
      const result = importedProfileSchema.safeParse({
        platform,
        profile_url: 'https://example.com/profile',
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid platform', () => {
    const result = importedProfileSchema.safeParse({
      platform: 'yelp',
      profile_url: 'https://example.com/profile',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing platform', () => {
    const result = importedProfileSchema.safeParse({
      profile_url: 'https://example.com/profile',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing profile_url', () => {
    const result = importedProfileSchema.safeParse({
      platform: 'rover',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid profile_url', () => {
    const result = importedProfileSchema.safeParse({
      platform: 'rover',
      profile_url: 'not-a-url',
    });
    expect(result.success).toBe(false);
  });

  it('accepts profile with only required fields', () => {
    const result = importedProfileSchema.safeParse({
      platform: 'wag',
      profile_url: 'https://wagwalking.com/caregiver/12345',
    });
    expect(result.success).toBe(true);
  });

  it('accepts null optional fields', () => {
    const result = importedProfileSchema.safeParse({
      platform: 'rover',
      profile_url: 'https://example.com/profile',
      display_name: null,
      review_count: null,
      avg_rating: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative review_count', () => {
    const result = importedProfileSchema.safeParse({
      platform: 'rover',
      profile_url: 'https://example.com/profile',
      review_count: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects review_count over 9999', () => {
    const result = importedProfileSchema.safeParse({
      platform: 'rover',
      profile_url: 'https://example.com/profile',
      review_count: 10000,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer review_count', () => {
    const result = importedProfileSchema.safeParse({
      platform: 'rover',
      profile_url: 'https://example.com/profile',
      review_count: 3.5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative avg_rating', () => {
    const result = importedProfileSchema.safeParse({
      platform: 'rover',
      profile_url: 'https://example.com/profile',
      avg_rating: -0.1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects avg_rating over 5', () => {
    const result = importedProfileSchema.safeParse({
      platform: 'rover',
      profile_url: 'https://example.com/profile',
      avg_rating: 5.1,
    });
    expect(result.success).toBe(false);
  });

  it('accepts avg_rating at boundary values 0 and 5', () => {
    for (const avg_rating of [0, 5]) {
      const result = importedProfileSchema.safeParse({
        platform: 'rover',
        profile_url: 'https://example.com/profile',
        avg_rating,
      });
      expect(result.success).toBe(true);
    }
  });

  it('accepts decimal avg_rating', () => {
    const result = importedProfileSchema.safeParse({
      platform: 'rover',
      profile_url: 'https://example.com/profile',
      avg_rating: 4.75,
    });
    expect(result.success).toBe(true);
  });

  it('rejects display_name over 100 characters', () => {
    const result = importedProfileSchema.safeParse({
      platform: 'rover',
      profile_url: 'https://example.com/profile',
      display_name: 'a'.repeat(101),
    });
    expect(result.success).toBe(false);
  });

  it('strips unknown fields', () => {
    const result = importedProfileSchema.safeParse({
      platform: 'rover',
      profile_url: 'https://example.com/profile',
      verified: true,
      id: 999,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toHaveProperty('verified');
      expect(result.data).not.toHaveProperty('id');
    }
  });
});

// --- DB Integration Tests ---

describe('imported_profiles table', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => { db = createTestDb(); });

  it('should create an imported profile', () => {
    db.prepare('INSERT INTO imported_profiles (user_id, platform, profile_url, display_name, review_count, avg_rating) VALUES (?, ?, ?, ?, ?, ?)').run(1, 'rover', 'https://rover.com/members/jane', 'Jane D.', 42, 4.8);
    const profile = db.prepare('SELECT * FROM imported_profiles WHERE user_id = 1').get() as Record<string, unknown>;
    expect(profile).toBeDefined();
    expect(profile.platform).toBe('rover');
    expect(profile.profile_url).toBe('https://rover.com/members/jane');
    expect(profile.display_name).toBe('Jane D.');
    expect(profile.review_count).toBe(42);
    expect(profile.avg_rating).toBe(4.8);
    expect(profile.verified).toBe(0);
  });

  it('should allow multiple platforms per user', () => {
    db.prepare('INSERT INTO imported_profiles (user_id, platform, profile_url) VALUES (?, ?, ?)').run(1, 'rover', 'https://rover.com/members/jane');
    db.prepare('INSERT INTO imported_profiles (user_id, platform, profile_url) VALUES (?, ?, ?)').run(1, 'wag', 'https://wagwalking.com/caregiver/jane');
    const profiles = db.prepare('SELECT * FROM imported_profiles WHERE user_id = 1').all() as Record<string, unknown>[];
    expect(profiles).toHaveLength(2);
  });

  it('should prevent duplicate platform per user (unique constraint)', () => {
    db.prepare('INSERT INTO imported_profiles (user_id, platform, profile_url) VALUES (?, ?, ?)').run(1, 'rover', 'https://rover.com/members/jane');
    expect(() => {
      db.prepare('INSERT INTO imported_profiles (user_id, platform, profile_url) VALUES (?, ?, ?)').run(1, 'rover', 'https://rover.com/members/other');
    }).toThrow();
  });

  it('should allow same platform for different users', () => {
    db.prepare('INSERT INTO imported_profiles (user_id, platform, profile_url) VALUES (?, ?, ?)').run(1, 'rover', 'https://rover.com/members/jane');
    db.prepare('INSERT INTO imported_profiles (user_id, platform, profile_url) VALUES (?, ?, ?)').run(2, 'rover', 'https://rover.com/members/bob');
    const profiles = db.prepare('SELECT * FROM imported_profiles WHERE platform = ?').all('rover') as Record<string, unknown>[];
    expect(profiles).toHaveLength(2);
  });

  it('should delete an imported profile', () => {
    db.prepare('INSERT INTO imported_profiles (user_id, platform, profile_url) VALUES (?, ?, ?)').run(1, 'rover', 'https://rover.com/members/jane');
    db.prepare('DELETE FROM imported_profiles WHERE user_id = ? AND platform = ?').run(1, 'rover');
    const profile = db.prepare('SELECT * FROM imported_profiles WHERE user_id = 1 AND platform = ?').get('rover');
    expect(profile).toBeUndefined();
  });

  it('should cascade delete when user is deleted', () => {
    db.prepare('INSERT INTO imported_profiles (user_id, platform, profile_url) VALUES (?, ?, ?)').run(1, 'rover', 'https://rover.com/members/jane');
    db.prepare('INSERT INTO imported_profiles (user_id, platform, profile_url) VALUES (?, ?, ?)').run(1, 'wag', 'https://wagwalking.com/caregiver/jane');
    db.prepare('DELETE FROM users WHERE id = ?').run(1);
    const profiles = db.prepare('SELECT * FROM imported_profiles WHERE user_id = 1').all();
    expect(profiles).toHaveLength(0);
  });

  it('should not affect other users profiles on delete', () => {
    db.prepare('INSERT INTO imported_profiles (user_id, platform, profile_url) VALUES (?, ?, ?)').run(1, 'rover', 'https://rover.com/members/jane');
    db.prepare('INSERT INTO imported_profiles (user_id, platform, profile_url) VALUES (?, ?, ?)').run(2, 'rover', 'https://rover.com/members/bob');
    db.prepare('DELETE FROM users WHERE id = ?').run(1);
    const profiles = db.prepare('SELECT * FROM imported_profiles WHERE user_id = 2').all() as Record<string, unknown>[];
    expect(profiles).toHaveLength(1);
  });

  it('should allow null optional fields', () => {
    db.prepare('INSERT INTO imported_profiles (user_id, platform, profile_url) VALUES (?, ?, ?)').run(1, 'care_com', 'https://care.com/p/jane');
    const profile = db.prepare('SELECT * FROM imported_profiles WHERE user_id = 1').get() as Record<string, unknown>;
    expect(profile.display_name).toBeNull();
    expect(profile.review_count).toBeNull();
    expect(profile.avg_rating).toBeNull();
  });

  it('should list profiles for a user', () => {
    db.prepare('INSERT INTO imported_profiles (user_id, platform, profile_url, review_count, avg_rating) VALUES (?, ?, ?, ?, ?)').run(1, 'rover', 'https://rover.com/members/jane', 10, 4.5);
    db.prepare('INSERT INTO imported_profiles (user_id, platform, profile_url, review_count, avg_rating) VALUES (?, ?, ?, ?, ?)').run(1, 'wag', 'https://wagwalking.com/caregiver/jane', 5, 4.9);
    const profiles = db.prepare('SELECT * FROM imported_profiles WHERE user_id = ? ORDER BY platform').all(1) as Record<string, unknown>[];
    expect(profiles).toHaveLength(2);
    expect(profiles[0].platform).toBe('rover');
    expect(profiles[1].platform).toBe('wag');
  });
});
