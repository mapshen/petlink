import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { updateCareInstructionsSchema, careInstructionSchema } from './validation.ts';

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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE pets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      care_instructions TEXT DEFAULT '[]'
    );
    CREATE TABLE services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sitter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      price REAL NOT NULL
    );
    CREATE TABLE bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sitter_id INTEGER NOT NULL REFERENCES users(id),
      owner_id INTEGER NOT NULL REFERENCES users(id),
      service_id INTEGER REFERENCES services(id),
      status TEXT DEFAULT 'pending',
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      total_price REAL
    );
    CREATE TABLE booking_pets (
      booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
      PRIMARY KEY (booking_id, pet_id)
    );
    CREATE TABLE booking_care_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      description TEXT NOT NULL,
      time TEXT,
      notes TEXT,
      completed INTEGER DEFAULT 0,
      completed_at TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const hash = bcrypt.hashSync('pass', 10);
  db.prepare("INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)").run('owner@test.com', hash, 'Owner', 'owner');
  db.prepare("INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)").run('sitter@test.com', hash, 'Sitter', 'sitter');
  db.prepare("INSERT INTO services (sitter_id, type, price) VALUES (?, ?, ?)").run(2, 'walking', 25);

  return db;
}

describe('careInstructionSchema', () => {
  it('accepts valid care instruction', () => {
    const result = careInstructionSchema.safeParse({
      id: 'abc123',
      category: 'feeding',
      description: 'Feed 1 cup kibble',
      time: '8:00 AM',
      notes: 'Use the blue bowl',
    });
    expect(result.success).toBe(true);
  });

  it('accepts all valid categories', () => {
    for (const cat of ['feeding', 'medication', 'exercise', 'grooming', 'behavioral', 'other']) {
      expect(careInstructionSchema.safeParse({ id: '1', category: cat, description: 'test' }).success).toBe(true);
    }
  });

  it('rejects invalid category', () => {
    expect(careInstructionSchema.safeParse({ id: '1', category: 'sleeping', description: 'test' }).success).toBe(false);
  });

  it('rejects empty description', () => {
    expect(careInstructionSchema.safeParse({ id: '1', category: 'feeding', description: '' }).success).toBe(false);
  });

  it('rejects description over 500 chars', () => {
    expect(careInstructionSchema.safeParse({ id: '1', category: 'feeding', description: 'a'.repeat(501) }).success).toBe(false);
  });
});

describe('updateCareInstructionsSchema', () => {
  it('accepts valid array of instructions', () => {
    const result = updateCareInstructionsSchema.safeParse({
      care_instructions: [
        { id: '1', category: 'feeding', description: 'Feed 1 cup kibble', time: '8:00 AM' },
        { id: '2', category: 'medication', description: 'Give insulin shot', time: '2:00 PM' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty array (clear all instructions)', () => {
    const result = updateCareInstructionsSchema.safeParse({ care_instructions: [] });
    expect(result.success).toBe(true);
  });

  it('rejects more than 50 instructions', () => {
    const instructions = Array.from({ length: 51 }, (_, i) => ({
      id: String(i), category: 'feeding', description: `Instruction ${i}`,
    }));
    expect(updateCareInstructionsSchema.safeParse({ care_instructions: instructions }).success).toBe(false);
  });
});

describe('booking care tasks', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => { db = createTestDb(); });

  it('stores care tasks for a booking', () => {
    db.prepare('INSERT INTO pets (owner_id, name) VALUES (?, ?)').run(1, 'Buddy');
    db.prepare("INSERT INTO bookings (sitter_id, owner_id, service_id, start_time, end_time) VALUES (?, ?, ?, ?, ?)").run(2, 1, 1, '2026-04-01T10:00:00Z', '2026-04-01T11:00:00Z');
    db.prepare('INSERT INTO booking_pets (booking_id, pet_id) VALUES (?, ?)').run(1, 1);

    db.prepare('INSERT INTO booking_care_tasks (booking_id, pet_id, category, description, time) VALUES (?, ?, ?, ?, ?)').run(1, 1, 'feeding', 'Feed 1 cup kibble', '8:00 AM');
    db.prepare('INSERT INTO booking_care_tasks (booking_id, pet_id, category, description, time, notes) VALUES (?, ?, ?, ?, ?, ?)').run(1, 1, 'medication', 'Give insulin', '2:00 PM', 'Use syringe from fridge');

    const tasks = db.prepare('SELECT * FROM booking_care_tasks WHERE booking_id = 1').all() as Record<string, unknown>[];
    expect(tasks).toHaveLength(2);
    expect(tasks[0].category).toBe('feeding');
    expect(tasks[1].notes).toBe('Use syringe from fridge');
  });

  it('marks task as completed', () => {
    db.prepare('INSERT INTO pets (owner_id, name) VALUES (?, ?)').run(1, 'Buddy');
    db.prepare("INSERT INTO bookings (sitter_id, owner_id, service_id, start_time, end_time) VALUES (?, ?, ?, ?, ?)").run(2, 1, 1, '2026-04-01T10:00:00Z', '2026-04-01T11:00:00Z');
    db.prepare('INSERT INTO booking_care_tasks (booking_id, pet_id, category, description) VALUES (?, ?, ?, ?)').run(1, 1, 'feeding', 'Feed 1 cup kibble');

    db.prepare("UPDATE booking_care_tasks SET completed = 1, completed_at = datetime('now') WHERE id = 1").run();
    const task = db.prepare('SELECT * FROM booking_care_tasks WHERE id = 1').get() as Record<string, unknown>;
    expect(task.completed).toBe(1);
    expect(task.completed_at).toBeTruthy();
  });

  it('cascades task deletion when booking is deleted', () => {
    db.prepare('INSERT INTO pets (owner_id, name) VALUES (?, ?)').run(1, 'Buddy');
    db.prepare("INSERT INTO bookings (sitter_id, owner_id, service_id, start_time, end_time) VALUES (?, ?, ?, ?, ?)").run(2, 1, 1, '2026-04-01T10:00:00Z', '2026-04-01T11:00:00Z');
    db.prepare('INSERT INTO booking_care_tasks (booking_id, pet_id, category, description) VALUES (?, ?, ?, ?)').run(1, 1, 'feeding', 'Feed');

    db.prepare('DELETE FROM bookings WHERE id = 1').run();
    expect(db.prepare('SELECT * FROM booking_care_tasks').all()).toHaveLength(0);
  });

  it('cascades task deletion when pet is deleted', () => {
    db.prepare('INSERT INTO pets (owner_id, name) VALUES (?, ?)').run(1, 'Buddy');
    db.prepare("INSERT INTO bookings (sitter_id, owner_id, service_id, start_time, end_time) VALUES (?, ?, ?, ?, ?)").run(2, 1, 1, '2026-04-01T10:00:00Z', '2026-04-01T11:00:00Z');
    db.prepare('INSERT INTO booking_care_tasks (booking_id, pet_id, category, description) VALUES (?, ?, ?, ?)').run(1, 1, 'feeding', 'Feed');

    db.prepare('DELETE FROM pets WHERE id = 1').run();
    expect(db.prepare('SELECT * FROM booking_care_tasks').all()).toHaveLength(0);
  });

  it('stores care_instructions JSON on pets', () => {
    const instructions = JSON.stringify([
      { id: '1', category: 'feeding', description: 'Feed 1 cup', time: '8:00 AM' },
      { id: '2', category: 'medication', description: 'Insulin shot', time: '2:00 PM' },
    ]);
    db.prepare('INSERT INTO pets (owner_id, name, care_instructions) VALUES (?, ?, ?)').run(1, 'Buddy', instructions);

    const pet = db.prepare('SELECT care_instructions FROM pets WHERE name = ?').get('Buddy') as Record<string, unknown>;
    const parsed = JSON.parse(pet.care_instructions as string);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].category).toBe('feeding');
    expect(parsed[1].time).toBe('2:00 PM');
  });
});
