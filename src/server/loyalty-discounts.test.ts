import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';

describe('loyalty_discounts table constraints', () => {
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
        roles TEXT DEFAULT 'owner'
      );
      CREATE TABLE loyalty_discounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sitter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        min_bookings INTEGER NOT NULL CHECK(min_bookings >= 1 AND min_bookings <= 100),
        discount_percent INTEGER NOT NULL CHECK(discount_percent >= 1 AND discount_percent <= 50),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(sitter_id, min_bookings)
      );
    `);
    testDb.prepare("INSERT INTO users (email, password_hash, name, roles) VALUES ('sitter@test.com', 'hash', 'Sitter', 'owner,sitter')").run();
  });

  afterAll(() => {
    testDb.close();
  });

  it('inserts valid loyalty tier', () => {
    const info = testDb.prepare(
      'INSERT INTO loyalty_discounts (sitter_id, min_bookings, discount_percent) VALUES (1, 3, 5)'
    ).run();
    expect(info.changes).toBe(1);
  });

  it('inserts multiple tiers for same sitter', () => {
    testDb.prepare(
      'INSERT INTO loyalty_discounts (sitter_id, min_bookings, discount_percent) VALUES (1, 5, 10)'
    ).run();
    testDb.prepare(
      'INSERT INTO loyalty_discounts (sitter_id, min_bookings, discount_percent) VALUES (1, 10, 15)'
    ).run();

    const rows = testDb.prepare('SELECT * FROM loyalty_discounts WHERE sitter_id = 1 ORDER BY min_bookings').all();
    expect(rows).toHaveLength(3);
  });

  it('rejects duplicate min_bookings for same sitter', () => {
    expect(() =>
      testDb.prepare(
        'INSERT INTO loyalty_discounts (sitter_id, min_bookings, discount_percent) VALUES (1, 3, 8)'
      ).run()
    ).toThrow();
  });

  it('rejects min_bookings below 1', () => {
    expect(() =>
      testDb.prepare(
        'INSERT INTO loyalty_discounts (sitter_id, min_bookings, discount_percent) VALUES (1, 0, 5)'
      ).run()
    ).toThrow();
  });

  it('rejects discount_percent above 50', () => {
    expect(() =>
      testDb.prepare(
        'INSERT INTO loyalty_discounts (sitter_id, min_bookings, discount_percent) VALUES (1, 20, 51)'
      ).run()
    ).toThrow();
  });

  it('rejects discount_percent below 1', () => {
    expect(() =>
      testDb.prepare(
        'INSERT INTO loyalty_discounts (sitter_id, min_bookings, discount_percent) VALUES (1, 25, 0)'
      ).run()
    ).toThrow();
  });

  it('cascades delete when user is removed', () => {
    testDb.prepare("INSERT INTO users (email, password_hash, name, roles) VALUES ('temp@test.com', 'hash', 'Temp', 'sitter')").run();
    const userId = testDb.prepare("SELECT id FROM users WHERE email = 'temp@test.com'").get() as { id: number };
    testDb.prepare('INSERT INTO loyalty_discounts (sitter_id, min_bookings, discount_percent) VALUES (?, 3, 5)').run(userId.id);

    testDb.prepare('DELETE FROM users WHERE id = ?').run(userId.id);
    const remaining = testDb.prepare('SELECT * FROM loyalty_discounts WHERE sitter_id = ?').all(userId.id);
    expect(remaining).toHaveLength(0);
  });
});

describe('custom_price_cents on bookings', () => {
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
        roles TEXT DEFAULT 'owner'
      );
      CREATE TABLE services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sitter_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        price_cents INTEGER NOT NULL,
        FOREIGN KEY (sitter_id) REFERENCES users(id)
      );
      CREATE TABLE bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sitter_id INTEGER NOT NULL,
        owner_id INTEGER NOT NULL,
        service_id INTEGER,
        status TEXT DEFAULT 'pending',
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        total_price_cents INTEGER,
        custom_price_cents INTEGER,
        discount_pct INTEGER,
        discount_reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sitter_id) REFERENCES users(id),
        FOREIGN KEY (owner_id) REFERENCES users(id)
      );
    `);

    testDb.prepare("INSERT INTO users (email, password_hash, name, roles) VALUES ('owner@test.com', 'hash', 'Owner', 'owner')").run();
    testDb.prepare("INSERT INTO users (email, password_hash, name, roles) VALUES ('sitter@test.com', 'hash', 'Sitter', 'owner,sitter')").run();
    testDb.prepare("INSERT INTO services (sitter_id, type, price_cents) VALUES (2, 'walking', 2500)").run();
  });

  afterAll(() => {
    testDb.close();
  });

  it('creates booking without custom price (null)', () => {
    testDb.prepare(
      "INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time, total_price_cents) VALUES (2, 1, 1, 'pending', '2026-04-10T10:00:00Z', '2026-04-10T11:00:00Z', 2500)"
    ).run();
    const row = testDb.prepare('SELECT custom_price_cents FROM bookings WHERE id = 1').get() as { custom_price_cents: number | null };
    expect(row.custom_price_cents).toBeNull();
  });

  it('sitter can set custom price when confirming', () => {
    testDb.prepare(
      "INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time, total_price_cents) VALUES (2, 1, 1, 'pending', '2026-04-11T10:00:00Z', '2026-04-11T11:00:00Z', 2500)"
    ).run();

    const info = testDb.prepare(
      "UPDATE bookings SET status = 'confirmed', custom_price_cents = 4000, total_price_cents = 4000 WHERE id = 2 AND sitter_id = 2 AND status = 'pending'"
    ).run();
    expect(info.changes).toBe(1);

    const row = testDb.prepare('SELECT total_price_cents, custom_price_cents FROM bookings WHERE id = 2').get() as { total_price_cents: number; custom_price_cents: number };
    expect(row.total_price_cents).toBe(4000);
    expect(row.custom_price_cents).toBe(4000);
  });

  it('stores discount fields on booking', () => {
    testDb.prepare(
      "INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time, total_price_cents, discount_pct, discount_reason) VALUES (2, 1, 1, 'pending', '2026-04-12T10:00:00Z', '2026-04-12T11:00:00Z', 2250, 10, 'Loyalty discount: 10% off (5+ bookings)')"
    ).run();

    const row = testDb.prepare('SELECT discount_pct, discount_reason FROM bookings WHERE id = 3').get() as { discount_pct: number; discount_reason: string };
    expect(row.discount_pct).toBe(10);
    expect(row.discount_reason).toBe('Loyalty discount: 10% off (5+ bookings)');
  });

  it('custom price overrides total and records both', () => {
    testDb.prepare(
      "INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time, total_price_cents, custom_price_cents) VALUES (2, 1, 1, 'confirmed', '2026-04-13T10:00:00Z', '2026-04-13T11:00:00Z', 5000, 5000)"
    ).run();

    const row = testDb.prepare('SELECT total_price_cents, custom_price_cents FROM bookings WHERE id = 4').get() as { total_price_cents: number; custom_price_cents: number };
    expect(row.total_price_cents).toBe(5000);
    expect(row.custom_price_cents).toBe(5000);
  });
});

describe('loyalty discount validation schemas', () => {
  it('validates via Zod import', async () => {
    const { loyaltyDiscountSchema, loyaltyDiscountListSchema } = await import('../server/validation');

    // Valid single tier
    expect(loyaltyDiscountSchema.safeParse({ min_bookings: 3, discount_percent: 5 }).success).toBe(true);

    // Invalid: min_bookings too low
    expect(loyaltyDiscountSchema.safeParse({ min_bookings: 0, discount_percent: 5 }).success).toBe(false);

    // Invalid: discount too high
    expect(loyaltyDiscountSchema.safeParse({ min_bookings: 3, discount_percent: 51 }).success).toBe(false);

    // Valid list
    expect(loyaltyDiscountListSchema.safeParse({
      tiers: [
        { min_bookings: 3, discount_percent: 5 },
        { min_bookings: 10, discount_percent: 15 },
      ],
    }).success).toBe(true);

    // Too many tiers
    expect(loyaltyDiscountListSchema.safeParse({
      tiers: Array.from({ length: 6 }, (_, i) => ({
        min_bookings: i + 1,
        discount_percent: 5,
      })),
    }).success).toBe(false);
  });

  it('validates updateBookingStatusSchema with custom_price_cents', async () => {
    const { updateBookingStatusSchema } = await import('../server/validation');

    // Without custom price
    expect(updateBookingStatusSchema.safeParse({ status: 'confirmed' }).success).toBe(true);

    // With valid custom price
    expect(updateBookingStatusSchema.safeParse({ status: 'confirmed', custom_price_cents: 5000 }).success).toBe(true);

    // Custom price of 0 is valid (free override)
    expect(updateBookingStatusSchema.safeParse({ status: 'confirmed', custom_price_cents: 0 }).success).toBe(true);

    // Negative custom price is invalid
    expect(updateBookingStatusSchema.safeParse({ status: 'confirmed', custom_price_cents: -100 }).success).toBe(false);

    // Custom price over $1000 is invalid
    expect(updateBookingStatusSchema.safeParse({ status: 'confirmed', custom_price_cents: 100001 }).success).toBe(false);
  });
});
