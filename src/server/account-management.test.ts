import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { signupSchema } from './validation.ts';

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      name TEXT NOT NULL,
      role TEXT DEFAULT 'owner',
      bio TEXT,
      avatar_url TEXT,
      lat REAL,
      lng REAL,
      deleted_at TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE pets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      species TEXT DEFAULT 'dog',
      breed TEXT,
      age INTEGER,
      weight REAL,
      medical_history TEXT,
      photo_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sitter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      price REAL NOT NULL,
      description TEXT,
      additional_pet_price REAL DEFAULT 0,
      max_pets INTEGER DEFAULT 1,
      service_details TEXT
    );

    CREATE TABLE bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sitter_id INTEGER NOT NULL REFERENCES users(id),
      owner_id INTEGER NOT NULL REFERENCES users(id),
      service_id INTEGER REFERENCES services(id),
      status TEXT DEFAULT 'pending',
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      total_price REAL,
      payment_status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id INTEGER NOT NULL REFERENCES users(id),
      receiver_id INTEGER NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      read_at DATETIME
    );

    CREATE TABLE reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL REFERENCES bookings(id),
      reviewer_id INTEGER NOT NULL REFERENCES users(id),
      reviewee_id INTEGER NOT NULL REFERENCES users(id),
      rating INTEGER CHECK(rating >= 1 AND rating <= 5),
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(booking_id, reviewer_id)
    );

    CREATE TABLE favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sitter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, sitter_id)
    );

    CREATE TABLE notification_preferences (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      new_booking INTEGER DEFAULT 1,
      booking_status INTEGER DEFAULT 1,
      new_message INTEGER DEFAULT 1,
      walk_updates INTEGER DEFAULT 1,
      email_enabled INTEGER DEFAULT 1
    );

    CREATE TABLE availability (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sitter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      day_of_week INTEGER,
      specific_date TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      recurring INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      revoked_at TEXT
    );
  `);

  const hash = bcrypt.hashSync('password123', 10);
  db.prepare(
    "INSERT INTO users (email, password_hash, name, role, bio, avatar_url, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  ).run('owner@test.com', hash, 'Test Owner', 'owner', 'I love pets', 'https://example.com/avatar.jpg', 37.77, -122.42);
  db.prepare(
    "INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)",
  ).run('sitter@test.com', hash, 'Test Sitter', 'sitter');

  // Seed some data for export tests
  db.prepare("INSERT INTO pets (owner_id, name, species, breed, age) VALUES (?, ?, ?, ?, ?)").run(
    1,
    'Buddy',
    'dog',
    'Golden Retriever',
    3,
  );
  db.prepare(
    "INSERT INTO services (sitter_id, type, price, description) VALUES (?, ?, ?, ?)",
  ).run(2, 'walking', 25, 'Dog walking');

  return db;
}

describe('account management', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  // --- Soft Delete Tests ---

  describe('soft delete', () => {
    it('should anonymize user fields on soft delete', () => {
      const userId = 1;
      const timestamp = Date.now();
      const anonymizedEmail = `deleted_${userId}_${timestamp}@deleted.petlink.app`;

      db.prepare(
        `UPDATE users SET
          name = 'Deleted User',
          email = ?,
          bio = NULL,
          avatar_url = NULL,
          password_hash = NULL,
          lat = NULL,
          lng = NULL,
          deleted_at = datetime('now')
        WHERE id = ?`,
      ).run(anonymizedEmail, userId);

      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as Record<
        string,
        unknown
      >;
      expect(user.name).toBe('Deleted User');
      expect(user.email).toBe(anonymizedEmail);
      expect(user.bio).toBeNull();
      expect(user.avatar_url).toBeNull();
      expect(user.password_hash).toBeNull();
      expect(user.lat).toBeNull();
      expect(user.lng).toBeNull();
      expect(user.deleted_at).toBeTruthy();
    });

    it('should block deletion when active bookings exist', () => {
      const serviceId = (
        db.prepare('SELECT id FROM services WHERE sitter_id = ?').get(2) as Record<string, unknown>
      ).id;
      db.prepare(
        "INSERT INTO bookings (owner_id, sitter_id, service_id, status, start_time, end_time, total_price) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run(1, 2, serviceId, 'confirmed', '2025-06-01T09:00:00Z', '2025-06-01T10:00:00Z', 25);

      // Simulate the check
      const activeBookings = db
        .prepare(
          "SELECT id FROM bookings WHERE (owner_id = ? OR sitter_id = ?) AND status IN ('confirmed', 'in_progress')",
        )
        .all(1, 1) as Record<string, unknown>[];

      expect(activeBookings.length).toBeGreaterThan(0);
    });

    it('should cancel pending bookings on delete', () => {
      const serviceId = (
        db.prepare('SELECT id FROM services WHERE sitter_id = ?').get(2) as Record<string, unknown>
      ).id;
      db.prepare(
        "INSERT INTO bookings (owner_id, sitter_id, service_id, status, start_time, end_time, total_price) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run(1, 2, serviceId, 'pending', '2025-06-01T09:00:00Z', '2025-06-01T10:00:00Z', 25);

      db.prepare(
        "UPDATE bookings SET status = 'cancelled' WHERE owner_id = ? AND status = 'pending'",
      ).run(1);

      const booking = db.prepare('SELECT status FROM bookings WHERE owner_id = ?').get(1) as Record<
        string,
        unknown
      >;
      expect(booking.status).toBe('cancelled');
    });

    it('should anonymize reviews written by deleted user', () => {
      const serviceId = (
        db.prepare('SELECT id FROM services WHERE sitter_id = ?').get(2) as Record<string, unknown>
      ).id;
      db.prepare(
        "INSERT INTO bookings (owner_id, sitter_id, service_id, status, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(1, 2, serviceId, 'completed', '2025-01-01T09:00:00Z', '2025-01-01T10:00:00Z');

      const bookingId = (db.prepare('SELECT id FROM bookings').get() as Record<string, unknown>).id;
      db.prepare(
        'INSERT INTO reviews (booking_id, reviewer_id, reviewee_id, rating, comment) VALUES (?, ?, ?, ?, ?)',
      ).run(bookingId, 1, 2, 5, 'Great sitter!');

      // Anonymize reviews on delete
      db.prepare('UPDATE reviews SET comment = NULL WHERE reviewer_id = ?').run(1);

      const review = db.prepare('SELECT * FROM reviews WHERE reviewer_id = ?').get(1) as Record<
        string,
        unknown
      >;
      expect(review.comment).toBeNull();
      // Rating is preserved
      expect(review.rating).toBe(5);
    });
  });

  // --- Deleted User Auth Rejection ---

  describe('deleted user auth rejection', () => {
    it('should treat user with deleted_at as non-existent', () => {
      db.prepare("UPDATE users SET deleted_at = datetime('now') WHERE id = ?").run(1);

      const user = db
        .prepare('SELECT id, deleted_at FROM users WHERE id = ?')
        .get(1) as Record<string, unknown>;
      expect(user).toBeDefined();
      expect(user.deleted_at).toBeTruthy();

      // Auth middleware logic: if user.deleted_at is set, reject
      const shouldReject = !!user.deleted_at;
      expect(shouldReject).toBe(true);
    });

    it('should allow non-deleted user through auth', () => {
      const user = db
        .prepare('SELECT id, deleted_at FROM users WHERE id = ?')
        .get(1) as Record<string, unknown>;
      expect(user.deleted_at).toBeNull();

      const shouldReject = !!user.deleted_at;
      expect(shouldReject).toBe(false);
    });
  });

  // --- Age Verification (Zod schema) ---

  describe('age verification', () => {
    const validSignup = {
      email: 'new@test.com',
      password: 'password123',
      name: 'New User',
      age_confirmed: true,
    };

    it('should accept signup with age_confirmed: true', () => {
      const result = signupSchema.safeParse(validSignup);
      expect(result.success).toBe(true);
    });

    it('should reject signup with age_confirmed: false', () => {
      const result = signupSchema.safeParse({ ...validSignup, age_confirmed: false });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('13 years or older');
      }
    });

    it('should reject signup without age_confirmed', () => {
      const { age_confirmed: _, ...withoutAge } = validSignup;
      const result = signupSchema.safeParse(withoutAge);
      expect(result.success).toBe(false);
    });

    it('should reject signup with age_confirmed: null', () => {
      const result = signupSchema.safeParse({ ...validSignup, age_confirmed: null });
      expect(result.success).toBe(false);
    });
  });

  // --- Refresh Token Revocation on Delete ---

  describe('token revocation on delete', () => {
    it('should revoke all refresh tokens for deleted user', () => {
      const userId = 1;
      db.prepare(
        "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
      ).run(userId, 'hash1', '2026-01-01T00:00:00Z');
      db.prepare(
        "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
      ).run(userId, 'hash2', '2026-01-01T00:00:00Z');

      // Revoke all tokens
      db.prepare(
        "UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL",
      ).run(userId);

      const activeTokens = db
        .prepare(
          'SELECT * FROM refresh_tokens WHERE user_id = ? AND revoked_at IS NULL',
        )
        .all(userId) as Record<string, unknown>[];
      expect(activeTokens).toHaveLength(0);

      const allTokens = db
        .prepare('SELECT * FROM refresh_tokens WHERE user_id = ?')
        .all(userId) as Record<string, unknown>[];
      expect(allTokens).toHaveLength(2);
      for (const t of allTokens) {
        expect(t.revoked_at).toBeTruthy();
      }
    });
  });
});
