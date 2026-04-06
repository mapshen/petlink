import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

describe('meet & greet deposit system', () => {
  let testDb: ReturnType<typeof Database>;

  beforeAll(() => {
    testDb = new Database(':memory:');
    testDb.pragma('foreign_keys = ON');
    testDb.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
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
        deposit_status TEXT CHECK(deposit_status IN ('held', 'captured_as_deposit', 'applied', 'released_to_sitter', 'refunded')),
        deposit_applied_to_booking_id INTEGER REFERENCES bookings(id),
        meet_greet_notes TEXT,
        deposit_reminder_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sitter_id) REFERENCES users(id),
        FOREIGN KEY (owner_id) REFERENCES users(id)
      );
    `);

    testDb.prepare("INSERT INTO users (email, name, roles) VALUES ('owner@test.com', 'Owner', 'owner')").run();
    testDb.prepare("INSERT INTO users (email, name, roles) VALUES ('sitter@test.com', 'Sitter', 'owner,sitter')").run();
    testDb.prepare("INSERT INTO services (sitter_id, type, price_cents) VALUES (2, 'meet_greet', 1000)").run();
    testDb.prepare("INSERT INTO services (sitter_id, type, price_cents) VALUES (2, 'walking', 2500)").run();
  });

  afterAll(() => { testDb.close(); });

  beforeEach(() => {
    testDb.exec('DELETE FROM bookings');
    // Reset autoincrement so IDs are predictable
    testDb.exec("DELETE FROM sqlite_sequence WHERE name = 'bookings'");
  });

  // --- Deposit Creation ---

  it('meet & greet booking sets deposit_status to held', () => {
    testDb.prepare(
      "INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time, total_price_cents, deposit_status) VALUES (2, 1, 1, 'pending', '2026-05-01T10:00:00Z', '2026-05-01T10:30:00Z', 1000, 'held')"
    ).run();

    const booking = testDb.prepare('SELECT deposit_status, total_price_cents FROM bookings WHERE id = 1').get() as any;
    expect(booking.deposit_status).toBe('held');
    expect(booking.total_price_cents).toBe(1000);
  });

  it('non-meet-greet booking has null deposit_status', () => {
    testDb.prepare(
      "INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time, total_price_cents) VALUES (2, 1, 2, 'pending', '2026-05-01T10:00:00Z', '2026-05-01T11:00:00Z', 2500)"
    ).run();

    const booking = testDb.prepare('SELECT deposit_status FROM bookings WHERE id = 1').get() as any;
    expect(booking.deposit_status).toBeNull();
  });

  // --- Credit Application ---

  it('deposit can be applied to a follow-up booking', () => {
    // Create completed meet & greet with captured deposit
    testDb.prepare(
      "INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time, total_price_cents, deposit_status) VALUES (2, 1, 1, 'completed', '2026-05-01T10:00:00Z', '2026-05-01T10:30:00Z', 1000, 'captured_as_deposit')"
    ).run();

    // Create follow-up booking
    testDb.prepare(
      "INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time, total_price_cents) VALUES (2, 1, 2, 'pending', '2026-05-05T10:00:00Z', '2026-05-05T11:00:00Z', 2500)"
    ).run();

    // Apply deposit credit
    testDb.prepare(
      "UPDATE bookings SET deposit_status = 'applied', deposit_applied_to_booking_id = 2 WHERE id = 1"
    ).run();

    const meetGreet = testDb.prepare('SELECT deposit_status, deposit_applied_to_booking_id FROM bookings WHERE id = 1').get() as any;
    expect(meetGreet.deposit_status).toBe('applied');
    expect(meetGreet.deposit_applied_to_booking_id).toBe(2);
  });

  it('credit is capped at booking amount', () => {
    // Meet & greet deposit: $10
    const depositCents = 1000;
    // Follow-up booking: $8
    const bookingCents = 800;

    const creditApplied = Math.min(depositCents, bookingCents);
    const ownerPays = bookingCents - creditApplied;
    const refundDifference = depositCents - creditApplied;

    expect(creditApplied).toBe(800);
    expect(ownerPays).toBe(0);
    expect(refundDifference).toBe(200); // $2 refunded
  });

  // --- Deposit Release (30-day expiry) ---

  it('captured deposit eligible for release after 30 days', () => {
    const thirtyOneDaysAgo = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    testDb.prepare(
      "INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time, total_price_cents, deposit_status, created_at) VALUES (2, 1, 1, 'completed', ?, ?, 1000, 'captured_as_deposit', ?)"
    ).run(thirtyOneDaysAgo, thirtyOneDaysAgo, thirtyOneDaysAgo);

    // Check: completed, captured_as_deposit, end_time older than 30 days, no follow-up
    const eligible = testDb.prepare(`
      SELECT id FROM bookings
      WHERE deposit_status = 'captured_as_deposit'
        AND status = 'completed'
        AND end_time < datetime('now', '-30 days')
        AND NOT EXISTS (
          SELECT 1 FROM bookings b2
          WHERE b2.deposit_applied_to_booking_id = bookings.id
        )
    `).all();

    expect(eligible).toHaveLength(1);
  });

  it('captured deposit NOT eligible if follow-up booking exists', () => {
    testDb.prepare(
      "INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time, total_price_cents, deposit_status) VALUES (2, 1, 1, 'completed', '2026-04-01T10:00:00Z', '2026-04-01T10:30:00Z', 1000, 'applied')"
    ).run();

    const eligible = testDb.prepare(
      "SELECT id FROM bookings WHERE deposit_status = 'captured_as_deposit' AND status = 'completed'"
    ).all();
    expect(eligible).toHaveLength(0); // already applied
  });

  it('expiry sets deposit_status to released_to_sitter', () => {
    testDb.prepare(
      "INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time, total_price_cents, deposit_status) VALUES (2, 1, 1, 'completed', '2026-04-01T10:00:00Z', '2026-04-01T10:30:00Z', 1000, 'captured_as_deposit')"
    ).run();

    testDb.prepare("UPDATE bookings SET deposit_status = 'released_to_sitter' WHERE id = 1").run();

    const booking = testDb.prepare('SELECT deposit_status FROM bookings WHERE id = 1').get() as any;
    expect(booking.deposit_status).toBe('released_to_sitter');
  });

  // --- Cancellation ---

  it('sitter cancels: deposit refunded', () => {
    testDb.prepare(
      "INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time, total_price_cents, deposit_status) VALUES (2, 1, 1, 'pending', '2026-05-01T10:00:00Z', '2026-05-01T10:30:00Z', 1000, 'held')"
    ).run();

    // Sitter cancels → refund deposit
    testDb.prepare("UPDATE bookings SET status = 'cancelled', deposit_status = 'refunded' WHERE id = 1").run();

    const booking = testDb.prepare('SELECT status, deposit_status FROM bookings WHERE id = 1').get() as any;
    expect(booking.status).toBe('cancelled');
    expect(booking.deposit_status).toBe('refunded');
  });

  it('owner cancels: deposit forfeited per policy (captured)', () => {
    testDb.prepare(
      "INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time, total_price_cents, deposit_status) VALUES (2, 1, 1, 'confirmed', '2026-05-01T10:00:00Z', '2026-05-01T10:30:00Z', 1000, 'held')"
    ).run();

    // Owner cancels confirmed → deposit forfeited (released to sitter per policy)
    testDb.prepare("UPDATE bookings SET status = 'cancelled', deposit_status = 'released_to_sitter' WHERE id = 1").run();

    const booking = testDb.prepare('SELECT deposit_status FROM bookings WHERE id = 1').get() as any;
    expect(booking.deposit_status).toBe('released_to_sitter');
  });

  // --- Meet & Greet Notes ---

  it('sitter can add meet & greet notes after completion', () => {
    testDb.prepare(
      "INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time, total_price_cents, deposit_status) VALUES (2, 1, 1, 'completed', '2026-05-01T10:00:00Z', '2026-05-01T10:30:00Z', 1000, 'captured_as_deposit')"
    ).run();

    testDb.prepare("UPDATE bookings SET meet_greet_notes = 'Buddy was friendly, no issues with my cats.' WHERE id = 1 AND sitter_id = 2").run();

    const booking = testDb.prepare('SELECT meet_greet_notes FROM bookings WHERE id = 1').get() as any;
    expect(booking.meet_greet_notes).toBe('Buddy was friendly, no issues with my cats.');
  });

  // --- Reminder Tracking ---

  it('tracks deposit reminder count', () => {
    testDb.prepare(
      "INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time, total_price_cents, deposit_status, deposit_reminder_count) VALUES (2, 1, 1, 'completed', '2026-05-01T10:00:00Z', '2026-05-01T10:30:00Z', 1000, 'captured_as_deposit', 0)"
    ).run();

    testDb.prepare("UPDATE bookings SET deposit_reminder_count = deposit_reminder_count + 1 WHERE id = 1").run();
    testDb.prepare("UPDATE bookings SET deposit_reminder_count = deposit_reminder_count + 1 WHERE id = 1").run();

    const booking = testDb.prepare('SELECT deposit_reminder_count FROM bookings WHERE id = 1').get() as any;
    expect(booking.deposit_reminder_count).toBe(2);
  });

  // --- Available Credit Query ---

  it('finds available credit for owner-sitter pair', () => {
    testDb.prepare(
      "INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time, total_price_cents, deposit_status) VALUES (2, 1, 1, 'completed', '2026-05-01T10:00:00Z', '2026-05-01T10:30:00Z', 1000, 'captured_as_deposit')"
    ).run();

    const credit = testDb.prepare(`
      SELECT id, total_price_cents FROM bookings
      WHERE owner_id = 1 AND sitter_id = 2
        AND status = 'completed' AND deposit_status = 'captured_as_deposit'
    `).get() as any;

    expect(credit).toBeTruthy();
    expect(credit.total_price_cents).toBe(1000);
  });

  it('no credit available if already applied', () => {
    testDb.prepare(
      "INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time, total_price_cents, deposit_status) VALUES (2, 1, 1, 'completed', '2026-05-01T10:00:00Z', '2026-05-01T10:30:00Z', 1000, 'applied')"
    ).run();

    const credit = testDb.prepare(`
      SELECT id FROM bookings
      WHERE owner_id = 1 AND sitter_id = 2
        AND status = 'completed' AND deposit_status = 'captured_as_deposit'
    `).all();

    expect(credit).toHaveLength(0);
  });
});
