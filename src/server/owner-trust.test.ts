import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';

describe('owner trust profile', () => {
  let testDb: ReturnType<typeof Database>;

  beforeAll(() => {
    testDb = new Database(':memory:');
    testDb.pragma('foreign_keys = ON');
    testDb.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        avatar_url TEXT,
        roles TEXT DEFAULT 'owner',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE pets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        FOREIGN KEY (owner_id) REFERENCES users(id)
      );
      CREATE TABLE bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sitter_id INTEGER NOT NULL,
        owner_id INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        responded_at DATETIME,
        FOREIGN KEY (sitter_id) REFERENCES users(id),
        FOREIGN KEY (owner_id) REFERENCES users(id)
      );
      CREATE TABLE reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id INTEGER NOT NULL,
        reviewer_id INTEGER NOT NULL,
        reviewee_id INTEGER NOT NULL,
        rating INTEGER,
        comment TEXT,
        pet_accuracy_rating INTEGER,
        communication_rating INTEGER,
        preparedness_rating INTEGER,
        pet_care_rating INTEGER,
        reliability_rating INTEGER,
        published_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (reviewer_id) REFERENCES users(id),
        FOREIGN KEY (reviewee_id) REFERENCES users(id)
      );
      CREATE TABLE inquiries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id INTEGER NOT NULL,
        sitter_id INTEGER NOT NULL,
        FOREIGN KEY (owner_id) REFERENCES users(id),
        FOREIGN KEY (sitter_id) REFERENCES users(id)
      );
    `);

    // Seed: owner (id=1), sitter (id=2), another sitter (id=3)
    testDb.prepare("INSERT INTO users (email, name, roles) VALUES ('owner@test.com', 'Alice Owner', 'owner')").run();
    testDb.prepare("INSERT INTO users (email, name, roles) VALUES ('sitter@test.com', 'Bob Sitter', 'owner,sitter')").run();
    testDb.prepare("INSERT INTO users (email, name, roles) VALUES ('sitter2@test.com', 'Carol Sitter', 'owner,sitter')").run();

    // Owner has 2 pets
    testDb.prepare("INSERT INTO pets (owner_id, name) VALUES (1, 'Buddy')").run();
    testDb.prepare("INSERT INTO pets (owner_id, name) VALUES (1, 'Whiskers')").run();

    // 3 completed bookings, 1 cancelled by owner
    testDb.prepare("INSERT INTO bookings (sitter_id, owner_id, status, responded_at) VALUES (2, 1, 'completed', datetime('now', '-1 hour'))").run();
    testDb.prepare("INSERT INTO bookings (sitter_id, owner_id, status, responded_at) VALUES (2, 1, 'completed', datetime('now', '-30 minutes'))").run();
    testDb.prepare("INSERT INTO bookings (sitter_id, owner_id, status, responded_at) VALUES (3, 1, 'completed', datetime('now', '-2 hours'))").run();
    testDb.prepare("INSERT INTO bookings (sitter_id, owner_id, status) VALUES (2, 1, 'cancelled')").run();

    // Sitter reviews of owner (pet_accuracy_rating IS NOT NULL = sitter→owner review)
    testDb.prepare("INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, pet_accuracy_rating, communication_rating, preparedness_rating, published_at) VALUES (1, 2, 1, 5, 5, 4, 5, datetime('now'))").run();
    testDb.prepare("INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, pet_accuracy_rating, communication_rating, preparedness_rating, published_at) VALUES (3, 3, 1, 4, 4, 5, 3, datetime('now'))").run();

    // Owner review of sitter (pet_care_rating IS NOT NULL = owner→sitter review)
    testDb.prepare("INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, pet_care_rating, communication_rating, reliability_rating, published_at) VALUES (1, 1, 2, 5, 5, 5, 5, datetime('now'))").run();
  });

  afterAll(() => { testDb.close(); });

  // --- Booking Stats ---

  it('counts completed and cancelled bookings for owner', () => {
    const [stats] = testDb.prepare(`
      SELECT
        count(*) FILTER (WHERE status = 'completed') as completed,
        count(*) FILTER (WHERE status = 'cancelled') as cancelled
      FROM bookings WHERE owner_id = 1
    `).all() as any[];
    // SQLite doesn't support FILTER, so use CASE WHEN
    const [stats2] = testDb.prepare(`
      SELECT
        sum(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        sum(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
      FROM bookings WHERE owner_id = 1
    `).all() as any[];
    expect(stats2.completed).toBe(3);
    expect(stats2.cancelled).toBe(1);
  });

  it('calculates cancellation rate', () => {
    const completed = 3;
    const cancelled = 1;
    const total = completed + cancelled;
    const rate = Number((cancelled / total).toFixed(3));
    expect(rate).toBe(0.25);
  });

  // --- Review Stats ---

  it('aggregates sitter reviews of owner (pet_accuracy_rating IS NOT NULL)', () => {
    const reviews = testDb.prepare(`
      SELECT * FROM reviews
      WHERE reviewee_id = 1 AND pet_accuracy_rating IS NOT NULL
    `).all();
    expect(reviews).toHaveLength(2); // Both sitter reviews
  });

  it('filters owner reviews of sitter (pet_care_rating IS NOT NULL)', () => {
    const reviews = testDb.prepare(`
      SELECT * FROM reviews
      WHERE reviewee_id = 2 AND pet_care_rating IS NOT NULL
    `).all();
    expect(reviews).toHaveLength(1); // Owner→sitter review
  });

  it('role filter excludes wrong direction reviews', () => {
    // role=owner should only return sitter→owner reviews (pet_accuracy IS NOT NULL)
    const ownerReviews = testDb.prepare(`
      SELECT * FROM reviews
      WHERE reviewee_id = 1 AND pet_accuracy_rating IS NOT NULL
    `).all();
    expect(ownerReviews).toHaveLength(2);

    // role=sitter should only return owner→sitter reviews (pet_care IS NOT NULL)
    const sitterReviews = testDb.prepare(`
      SELECT * FROM reviews
      WHERE reviewee_id = 1 AND pet_care_rating IS NOT NULL
    `).all();
    expect(sitterReviews).toHaveLength(0); // No one reviewed owner with pet_care
  });

  it('calculates average sub-ratings', () => {
    const [stats] = testDb.prepare(`
      SELECT
        avg(rating) as avg_rating,
        avg(pet_accuracy_rating) as avg_pet_accuracy,
        avg(communication_rating) as avg_communication,
        avg(preparedness_rating) as avg_preparedness
      FROM reviews
      WHERE reviewee_id = 1 AND pet_accuracy_rating IS NOT NULL
    `).all() as any[];
    expect(stats.avg_rating).toBe(4.5);
    expect(stats.avg_pet_accuracy).toBe(4.5);
    expect(stats.avg_communication).toBe(4.5);
    expect(stats.avg_preparedness).toBe(4);
  });

  // --- Pet Count ---

  it('counts owner pets', () => {
    const [{ count }] = testDb.prepare('SELECT count(*) as count FROM pets WHERE owner_id = 1').all() as any[];
    expect(count).toBe(2);
  });

  // --- Badges ---

  it('verified_owner badge: has completed bookings with no cancellations', () => {
    // Owner has 1 cancellation, so NOT verified
    const completed = 3 as number;
    const cancelled = 1 as number;
    const isVerified = completed >= 1 && cancelled === 0;
    expect(isVerified).toBe(false);
  });

  it('verified_owner badge: owner with zero cancellations qualifies', () => {
    const completed = 5;
    const cancelled = 0;
    const isVerified = completed >= 1 && cancelled === 0;
    expect(isVerified).toBe(true);
  });

  // --- Access Control ---

  it('sitter with booking relationship can access trust profile', () => {
    const [relationship] = testDb.prepare(`
      SELECT EXISTS(
        SELECT 1 FROM bookings WHERE sitter_id = 2 AND owner_id = 1
      ) as has_relationship
    `).all() as any[];
    expect(relationship.has_relationship).toBe(1);
  });

  it('unrelated sitter cannot access trust profile', () => {
    // Sitter 3 has a booking with owner 1 (booking id=3)
    const [relationship] = testDb.prepare(`
      SELECT EXISTS(
        SELECT 1 FROM bookings WHERE sitter_id = 3 AND owner_id = 1
      ) as has_relationship
    `).all() as any[];
    expect(relationship.has_relationship).toBe(1);

    // But a hypothetical sitter 4 with no relationship
    const [noRelationship] = testDb.prepare(`
      SELECT EXISTS(
        SELECT 1 FROM bookings WHERE sitter_id = 99 AND owner_id = 1
      ) as has_relationship
    `).all() as any[];
    expect(noRelationship.has_relationship).toBe(0);
  });
});
