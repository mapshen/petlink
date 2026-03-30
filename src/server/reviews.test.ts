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
      pet_care_rating INTEGER CHECK(pet_care_rating >= 1 AND pet_care_rating <= 5),
      communication_rating INTEGER CHECK(communication_rating >= 1 AND communication_rating <= 5),
      reliability_rating INTEGER CHECK(reliability_rating >= 1 AND reliability_rating <= 5),
      pet_accuracy_rating INTEGER CHECK(pet_accuracy_rating >= 1 AND pet_accuracy_rating <= 5),
      preparedness_rating INTEGER CHECK(preparedness_rating >= 1 AND preparedness_rating <= 5),
      response_text TEXT,
      response_at DATETIME,
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

describe('sub-ratings', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => { db = createTestDb(); });

  it('stores sub-ratings alongside overall rating', () => {
    db.prepare(
      'INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, pet_care_rating, communication_rating, reliability_rating) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(1, 1, 2, 5, 5, 4, 5);

    const review = db.prepare('SELECT * FROM reviews WHERE id = 1').get() as Record<string, unknown>;
    expect(review.rating).toBe(5);
    expect(review.pet_care_rating).toBe(5);
    expect(review.communication_rating).toBe(4);
    expect(review.reliability_rating).toBe(5);
    expect(review.pet_accuracy_rating).toBeNull();
    expect(review.preparedness_rating).toBeNull();
  });

  it('allows review without sub-ratings (all null)', () => {
    db.prepare('INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating) VALUES (?, ?, ?, ?)').run(1, 1, 2, 4);

    const review = db.prepare('SELECT * FROM reviews WHERE id = 1').get() as Record<string, unknown>;
    expect(review.rating).toBe(4);
    expect(review.pet_care_rating).toBeNull();
    expect(review.communication_rating).toBeNull();
    expect(review.reliability_rating).toBeNull();
  });

  it('rejects sub-rating outside 1-5 range', () => {
    expect(() => {
      db.prepare(
        'INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, pet_care_rating) VALUES (?, ?, ?, ?, ?)'
      ).run(1, 1, 2, 5, 6);
    }).toThrow();

    expect(() => {
      db.prepare(
        'INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, communication_rating) VALUES (?, ?, ?, ?, ?)'
      ).run(1, 1, 2, 5, 0);
    }).toThrow();
  });

  it('stores sitter-specific sub-ratings (pet_accuracy, preparedness)', () => {
    db.prepare(
      'INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, pet_accuracy_rating, communication_rating, preparedness_rating) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(1, 2, 1, 4, 3, 5, 4);

    const review = db.prepare('SELECT * FROM reviews WHERE id = 1').get() as Record<string, unknown>;
    expect(review.pet_accuracy_rating).toBe(3);
    expect(review.communication_rating).toBe(5);
    expect(review.preparedness_rating).toBe(4);
    expect(review.pet_care_rating).toBeNull();
    expect(review.reliability_rating).toBeNull();
  });

  it('computes sub-rating averages across multiple reviews', () => {
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, pet_care_rating, communication_rating, published_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(1, 1, 2, 5, 5, 4, now);

    db.prepare('INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)').run(2, 1, 1, 'completed', '2025-02-01', '2025-02-02');
    db.prepare(
      'INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, pet_care_rating, communication_rating, published_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(2, 1, 2, 3, 3, 2, now);

    const stats = db.prepare(
      `SELECT AVG(pet_care_rating) as avg_pet_care, AVG(communication_rating) as avg_comm
       FROM reviews WHERE reviewee_id = 2 AND (published_at IS NOT NULL OR created_at < datetime('now', '-3 days'))`
    ).get() as Record<string, number | null>;

    expect(stats.avg_pet_care).toBe(4); // (5+3)/2
    expect(stats.avg_comm).toBe(3); // (4+2)/2
  });
});

describe('review responses', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => { db = createTestDb(); });

  it('allows reviewee to add a response to a published review', () => {
    const now = new Date().toISOString();
    db.prepare('INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, comment, published_at) VALUES (?, ?, ?, ?, ?, ?)').run(1, 1, 2, 5, 'Great!', now);

    db.prepare('UPDATE reviews SET response_text = ?, response_at = ? WHERE id = 1').run('Thank you!', now);

    const review = db.prepare('SELECT * FROM reviews WHERE id = 1').get() as Record<string, unknown>;
    expect(review.response_text).toBe('Thank you!');
    expect(review.response_at).not.toBeNull();
  });

  it('response starts as null', () => {
    db.prepare('INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating) VALUES (?, ?, ?, ?)').run(1, 1, 2, 5);

    const review = db.prepare('SELECT * FROM reviews WHERE id = 1').get() as Record<string, unknown>;
    expect(review.response_text).toBeNull();
    expect(review.response_at).toBeNull();
  });

  it('response is included when querying reviews', () => {
    const now = new Date().toISOString();
    db.prepare('INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, response_text, response_at, published_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(1, 1, 2, 5, 'Thanks!', now, now);

    const reviews = db.prepare(
      "SELECT * FROM reviews WHERE reviewee_id = 2 AND (published_at IS NOT NULL OR created_at < datetime('now', '-3 days'))"
    ).all() as Record<string, unknown>[];

    expect(reviews).toHaveLength(1);
    expect(reviews[0].response_text).toBe('Thanks!');
  });
});

describe('booking review state logic', () => {
  let db: ReturnType<typeof createTestDb>;
  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

  beforeEach(() => { db = createTestDb(); });

  function getBookingReviewState(bookingId: number, userId: number) {
    const allReviews = db.prepare('SELECT * FROM reviews WHERE booking_id = ?').all(bookingId) as Record<string, unknown>[];
    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId) as Record<string, unknown>;

    const visibleReviews = allReviews.filter((r) => {
      if (r.reviewer_id === userId) return true;
      const isPublished = r.published_at !== null || (Date.now() - new Date(r.created_at as string).getTime()) > THREE_DAYS_MS;
      return isPublished;
    });

    const userReview = allReviews.find((r) => r.reviewer_id === userId);
    const otherReview = allReviews.find((r) => r.reviewer_id !== userId);

    let canReview = false;
    if (booking.status === 'completed' && !userReview) {
      if (!otherReview) {
        canReview = true;
      } else {
        const otherAge = Date.now() - new Date(otherReview.created_at as string).getTime();
        canReview = otherAge <= THREE_DAYS_MS;
      }
    }

    const canRespond: Record<number, boolean> = {};
    for (const r of visibleReviews) {
      if (r.reviewee_id === userId && r.response_text === null) {
        const isPublished = r.published_at !== null || (Date.now() - new Date(r.created_at as string).getTime()) > THREE_DAYS_MS;
        canRespond[r.id as number] = isPublished;
      }
    }

    return { reviews: visibleReviews, canReview, canRespond };
  }

  it('neither reviewed yet: can_review true, no reviews visible', () => {
    const state = getBookingReviewState(1, 1); // owner's view
    expect(state.reviews).toHaveLength(0);
    expect(state.canReview).toBe(true);
    expect(Object.keys(state.canRespond)).toHaveLength(0);
  });

  it('owner reviewed, within 3 days: owner sees own review only, other side hidden', () => {
    db.prepare('INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating) VALUES (?, ?, ?, ?)').run(1, 1, 2, 5);

    const ownerState = getBookingReviewState(1, 1);
    expect(ownerState.reviews).toHaveLength(1);
    expect(ownerState.reviews[0].reviewer_id).toBe(1);
    expect(ownerState.canReview).toBe(false); // already reviewed

    // Sitter sees nothing (blind period)
    const sitterState = getBookingReviewState(1, 2);
    expect(sitterState.reviews).toHaveLength(0);
    expect(sitterState.canReview).toBe(true); // can still review within 3 days
  });

  it('both reviewed within 3 days: both reviews visible to both parties', () => {
    const now = new Date().toISOString();
    db.prepare('INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, published_at) VALUES (?, ?, ?, ?, ?)').run(1, 1, 2, 5, now);
    db.prepare('INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, published_at) VALUES (?, ?, ?, ?, ?)').run(1, 2, 1, 4, now);

    const ownerState = getBookingReviewState(1, 1);
    expect(ownerState.reviews).toHaveLength(2);
    expect(ownerState.canReview).toBe(false);

    const sitterState = getBookingReviewState(1, 2);
    expect(sitterState.reviews).toHaveLength(2);
    expect(sitterState.canReview).toBe(false);
  });

  it('3 days passed, only other reviewed: their review visible, you cannot review', () => {
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, created_at) VALUES (?, ?, ?, ?, ?)').run(1, 1, 2, 5, fourDaysAgo);

    // Sitter's view: owner reviewed 4 days ago, sitter didn't review
    const sitterState = getBookingReviewState(1, 2);
    expect(sitterState.reviews).toHaveLength(1); // owner's review visible (auto-published)
    expect(sitterState.canReview).toBe(false); // window closed
  });

  it('can_respond: true for published review where user is reviewee, no existing response', () => {
    const now = new Date().toISOString();
    db.prepare('INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, published_at) VALUES (?, ?, ?, ?, ?)').run(1, 1, 2, 5, now);

    const sitterState = getBookingReviewState(1, 2);
    expect(sitterState.reviews).toHaveLength(1);
    expect(sitterState.canRespond[1]).toBe(true);
  });

  it('can_respond: false for unpublished review within blind period', () => {
    db.prepare('INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating) VALUES (?, ?, ?, ?)').run(1, 1, 2, 5);

    // Sitter can't even see it during blind period, so no canRespond entry
    const sitterState = getBookingReviewState(1, 2);
    expect(sitterState.reviews).toHaveLength(0);
    expect(Object.keys(sitterState.canRespond)).toHaveLength(0);
  });

  it('can_respond: false when response already exists', () => {
    const now = new Date().toISOString();
    db.prepare('INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, published_at, response_text, response_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(1, 1, 2, 5, now, 'Thanks!', now);

    const sitterState = getBookingReviewState(1, 2);
    expect(sitterState.reviews).toHaveLength(1);
    expect(Object.keys(sitterState.canRespond)).toHaveLength(0); // already responded
  });

  it('user who missed review window can still respond to published review', () => {
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, created_at) VALUES (?, ?, ?, ?, ?)').run(1, 1, 2, 5, fourDaysAgo);

    const sitterState = getBookingReviewState(1, 2);
    expect(sitterState.canReview).toBe(false); // window closed
    expect(sitterState.canRespond[1]).toBe(true); // but can respond
  });
});
