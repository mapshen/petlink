import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';

describe('booking status management', () => {
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
        role TEXT DEFAULT 'owner'
      );
      CREATE TABLE services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sitter_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        price REAL NOT NULL,
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
        total_price REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sitter_id) REFERENCES users(id),
        FOREIGN KEY (owner_id) REFERENCES users(id)
      );
    `);

    testDb.prepare("INSERT INTO users (email, password_hash, name, role) VALUES ('owner@test.com', 'hash', 'Owner', 'owner')").run();
    testDb.prepare("INSERT INTO users (email, password_hash, name, role) VALUES ('sitter@test.com', 'hash', 'Sitter', 'sitter')").run();
    testDb.prepare("INSERT INTO services (sitter_id, type, price) VALUES (2, 'walking', 25)").run();
  });

  afterAll(() => {
    testDb.close();
  });

  it('sitter can confirm a pending booking', () => {
    testDb.prepare("INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time) VALUES (2, 1, 1, 'pending', '2026-03-01T10:00:00Z', '2026-03-01T11:00:00Z')").run();
    const info = testDb.prepare("UPDATE bookings SET status = 'confirmed' WHERE id = 1 AND sitter_id = 2 AND status = 'pending'").run();
    expect(info.changes).toBe(1);
    const row = testDb.prepare('SELECT status FROM bookings WHERE id = 1').get() as { status: string };
    expect(row.status).toBe('confirmed');
  });

  it('sitter can decline a pending booking', () => {
    testDb.prepare("INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time) VALUES (2, 1, 1, 'pending', '2026-03-02T10:00:00Z', '2026-03-02T11:00:00Z')").run();
    const info = testDb.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = 2 AND sitter_id = 2 AND status = 'pending'").run();
    expect(info.changes).toBe(1);
    const row = testDb.prepare('SELECT status FROM bookings WHERE id = 2').get() as { status: string };
    expect(row.status).toBe('cancelled');
  });

  it('owner can cancel a pending booking', () => {
    testDb.prepare("INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time) VALUES (2, 1, 1, 'pending', '2026-03-03T10:00:00Z', '2026-03-03T11:00:00Z')").run();
    const info = testDb.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = 3 AND owner_id = 1 AND status = 'pending'").run();
    expect(info.changes).toBe(1);
    const row = testDb.prepare('SELECT status FROM bookings WHERE id = 3').get() as { status: string };
    expect(row.status).toBe('cancelled');
  });

  it('owner can cancel a confirmed booking', () => {
    testDb.prepare("INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time) VALUES (2, 1, 1, 'confirmed', '2026-03-04T10:00:00Z', '2026-03-04T11:00:00Z')").run();
    const info = testDb.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = 4 AND owner_id = 1 AND status IN ('pending', 'confirmed')").run();
    expect(info.changes).toBe(1);
    const row = testDb.prepare('SELECT status FROM bookings WHERE id = 4').get() as { status: string };
    expect(row.status).toBe('cancelled');
  });

  it('does not allow confirming a cancelled booking', () => {
    testDb.prepare("INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time) VALUES (2, 1, 1, 'cancelled', '2026-03-05T10:00:00Z', '2026-03-05T11:00:00Z')").run();
    const info = testDb.prepare("UPDATE bookings SET status = 'confirmed' WHERE id = 5 AND sitter_id = 2 AND status = 'pending'").run();
    expect(info.changes).toBe(0);
    const row = testDb.prepare('SELECT status FROM bookings WHERE id = 5').get() as { status: string };
    expect(row.status).toBe('cancelled');
  });

  it('does not allow cancelling a completed booking', () => {
    testDb.prepare("INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time) VALUES (2, 1, 1, 'completed', '2026-03-06T10:00:00Z', '2026-03-06T11:00:00Z')").run();
    const info = testDb.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = 6 AND owner_id = 1 AND status IN ('pending', 'confirmed')").run();
    expect(info.changes).toBe(0);
    const row = testDb.prepare('SELECT status FROM bookings WHERE id = 6').get() as { status: string };
    expect(row.status).toBe('completed');
  });

  it('unrelated user cannot update booking status', () => {
    testDb.prepare("INSERT INTO users (email, password_hash, name, role) VALUES ('other@test.com', 'hash', 'Other', 'owner')").run();
    testDb.prepare("INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time) VALUES (2, 1, 1, 'pending', '2026-03-07T10:00:00Z', '2026-03-07T11:00:00Z')").run();
    const info = testDb.prepare("UPDATE bookings SET status = 'confirmed' WHERE id = 7 AND (sitter_id = 3 OR owner_id = 3) AND status = 'pending'").run();
    expect(info.changes).toBe(0);
  });
});
