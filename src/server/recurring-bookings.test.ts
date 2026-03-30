import { describe, it, expect } from 'vitest';
import { createRecurringBookingSchema } from './validation.ts';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

describe('createRecurringBookingSchema', () => {
  it('accepts valid recurring booking', () => {
    const result = createRecurringBookingSchema.safeParse({
      sitter_id: 2,
      service_id: 1,
      pet_ids: [1],
      frequency: 'weekly',
      day_of_week: 2,
      start_time: '15:00',
      end_time: '16:00',
    });
    expect(result.success).toBe(true);
  });

  it('accepts all frequencies', () => {
    for (const freq of ['weekly', 'biweekly', 'monthly']) {
      expect(createRecurringBookingSchema.safeParse({
        sitter_id: 2, service_id: 1, pet_ids: [1],
        frequency: freq, day_of_week: 0, start_time: '10:00', end_time: '11:00',
      }).success).toBe(true);
    }
  });

  it('rejects invalid frequency', () => {
    expect(createRecurringBookingSchema.safeParse({
      sitter_id: 2, service_id: 1, pet_ids: [1],
      frequency: 'daily', day_of_week: 0, start_time: '10:00', end_time: '11:00',
    }).success).toBe(false);
  });

  it('rejects invalid day_of_week', () => {
    expect(createRecurringBookingSchema.safeParse({
      sitter_id: 2, service_id: 1, pet_ids: [1],
      frequency: 'weekly', day_of_week: 7, start_time: '10:00', end_time: '11:00',
    }).success).toBe(false);
  });

  it('rejects invalid time format', () => {
    expect(createRecurringBookingSchema.safeParse({
      sitter_id: 2, service_id: 1, pet_ids: [1],
      frequency: 'weekly', day_of_week: 0, start_time: '3pm', end_time: '4pm',
    }).success).toBe(false);
  });

  it('rejects empty pet_ids', () => {
    expect(createRecurringBookingSchema.safeParse({
      sitter_id: 2, service_id: 1, pet_ids: [],
      frequency: 'weekly', day_of_week: 0, start_time: '10:00', end_time: '11:00',
    }).success).toBe(false);
  });
});

describe('recurring_bookings table', () => {
  function createTestDb() {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, name TEXT NOT NULL, roles TEXT DEFAULT 'owner');
      CREATE TABLE services (id INTEGER PRIMARY KEY AUTOINCREMENT, sitter_id INTEGER NOT NULL REFERENCES users(id), type TEXT NOT NULL, price REAL NOT NULL);
      CREATE TABLE recurring_bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        sitter_id INTEGER NOT NULL REFERENCES users(id),
        service_id INTEGER NOT NULL REFERENCES services(id),
        pet_ids TEXT DEFAULT '[]',
        frequency TEXT NOT NULL DEFAULT 'weekly',
        day_of_week INTEGER NOT NULL CHECK(day_of_week >= 0 AND day_of_week <= 6),
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        active INTEGER DEFAULT 1,
        next_occurrence TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    const hash = bcrypt.hashSync('pass', 10);
    db.prepare("INSERT INTO users (email, password_hash, name, roles) VALUES (?, ?, ?, ?)").run('owner@test.com', hash, 'Owner', 'owner');
    db.prepare("INSERT INTO users (email, password_hash, name, roles) VALUES (?, ?, ?, ?)").run('sitter@test.com', hash, 'Sitter', 'owner,sitter');
    db.prepare("INSERT INTO services (sitter_id, type, price) VALUES (?, ?, ?)").run(2, 'walking', 25);
    return db;
  }

  it('creates a recurring booking', () => {
    const db = createTestDb();
    db.prepare("INSERT INTO recurring_bookings (owner_id, sitter_id, service_id, frequency, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?, ?)").run(1, 2, 1, 'weekly', 2, '15:00', '16:00');
    const rb = db.prepare('SELECT * FROM recurring_bookings WHERE owner_id = 1').get() as Record<string, unknown>;
    expect(rb.frequency).toBe('weekly');
    expect(rb.day_of_week).toBe(2);
    expect(rb.active).toBe(1);
  });

  it('pauses and resumes recurring booking', () => {
    const db = createTestDb();
    db.prepare("INSERT INTO recurring_bookings (owner_id, sitter_id, service_id, frequency, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?, ?)").run(1, 2, 1, 'weekly', 2, '15:00', '16:00');
    db.prepare('UPDATE recurring_bookings SET active = 0 WHERE id = 1').run();
    let rb = db.prepare('SELECT active FROM recurring_bookings WHERE id = 1').get() as Record<string, unknown>;
    expect(rb.active).toBe(0);
    db.prepare('UPDATE recurring_bookings SET active = 1 WHERE id = 1').run();
    rb = db.prepare('SELECT active FROM recurring_bookings WHERE id = 1').get() as Record<string, unknown>;
    expect(rb.active).toBe(1);
  });

  it('cascades delete when owner is deleted', () => {
    const db = createTestDb();
    db.prepare("INSERT INTO recurring_bookings (owner_id, sitter_id, service_id, frequency, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?, ?)").run(1, 2, 1, 'weekly', 2, '15:00', '16:00');
    db.prepare('DELETE FROM users WHERE id = 1').run();
    expect(db.prepare('SELECT * FROM recurring_bookings').all()).toHaveLength(0);
  });
});
