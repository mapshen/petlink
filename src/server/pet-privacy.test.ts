import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// SQLite in-memory DB for pet privacy gate tests
// ---------------------------------------------------------------------------
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE pets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      care_instructions TEXT DEFAULT '[]'
    );

    CREATE TABLE pet_vaccinations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
      vaccine_name TEXT NOT NULL,
      administered_date TEXT,
      expiration_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sitter_id INTEGER NOT NULL REFERENCES users(id),
      owner_id INTEGER NOT NULL REFERENCES users(id),
      status TEXT DEFAULT 'pending',
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL
    );

    CREATE TABLE booking_pets (
      booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
      PRIMARY KEY (booking_id, pet_id)
    );
  `);

  // Seed users: 1=owner, 2=sitter, 3=unrelated user, 4=admin
  db.prepare("INSERT INTO users (email, password_hash, name, roles) VALUES (?, ?, ?, ?)").run('owner@test.com', 'hash', 'Owner', 'owner');
  db.prepare("INSERT INTO users (email, password_hash, name, roles) VALUES (?, ?, ?, ?)").run('sitter@test.com', 'hash', 'Sitter', 'owner,sitter');
  db.prepare("INSERT INTO users (email, password_hash, name, roles) VALUES (?, ?, ?, ?)").run('stranger@test.com', 'hash', 'Stranger', 'owner');
  db.prepare("INSERT INTO users (email, password_hash, name, roles) VALUES (?, ?, ?, ?)").run('admin@test.com', 'hash', 'Admin', 'owner,sitter,admin');

  // Seed pet owned by user 1
  const instructions = JSON.stringify([
    { id: '1', category: 'feeding', description: 'Feed 1 cup kibble', time: '8:00 AM' },
    { id: '2', category: 'medication', description: 'Give insulin shot', time: '2:00 PM' },
  ]);
  db.prepare('INSERT INTO pets (owner_id, name, care_instructions) VALUES (?, ?, ?)').run(1, 'Buddy', instructions);

  // Seed vaccination for pet 1
  db.prepare("INSERT INTO pet_vaccinations (pet_id, vaccine_name, administered_date, expiration_date) VALUES (?, ?, ?, ?)").run(1, 'Rabies', '2025-06-01', '2026-06-01');

  return db;
}

// ---------------------------------------------------------------------------
// Privacy gate logic (mirrors server-side access check)
// ---------------------------------------------------------------------------
function canViewPrivate(userId: number, petOwnerId: number, userRoles: string[], petId: number, db: InstanceType<typeof Database>): boolean {
  if (userId === petOwnerId) return true;
  if (userRoles.includes('admin')) return true;
  const booking = db.prepare(`
    SELECT 1 FROM booking_pets bp
    JOIN bookings b ON b.id = bp.booking_id
    WHERE bp.pet_id = ? AND b.sitter_id = ? AND b.status IN ('confirmed', 'in_progress', 'completed')
    LIMIT 1
  `).get(petId, userId);
  return !!booking;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('pet profile privacy gate', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('owner can see own pet care_instructions and vaccinations', () => {
    const result = canViewPrivate(1, 1, ['owner'], 1, db);
    expect(result).toBe(true);
  });

  it('admin can see care_instructions and vaccinations', () => {
    const result = canViewPrivate(4, 1, ['owner', 'sitter', 'admin'], 1, db);
    expect(result).toBe(true);
  });

  it('sitter with confirmed booking can see care_instructions and vaccinations', () => {
    db.prepare("INSERT INTO bookings (sitter_id, owner_id, status, start_time, end_time) VALUES (?, ?, ?, ?, ?)").run(2, 1, 'confirmed', '2026-04-10T10:00:00Z', '2026-04-10T11:00:00Z');
    db.prepare('INSERT INTO booking_pets (booking_id, pet_id) VALUES (?, ?)').run(1, 1);

    const result = canViewPrivate(2, 1, ['owner', 'sitter'], 1, db);
    expect(result).toBe(true);
  });

  it('sitter with in_progress booking can see care_instructions and vaccinations', () => {
    db.prepare("INSERT INTO bookings (sitter_id, owner_id, status, start_time, end_time) VALUES (?, ?, ?, ?, ?)").run(2, 1, 'in_progress', '2026-04-10T10:00:00Z', '2026-04-10T11:00:00Z');
    db.prepare('INSERT INTO booking_pets (booking_id, pet_id) VALUES (?, ?)').run(1, 1);

    const result = canViewPrivate(2, 1, ['owner', 'sitter'], 1, db);
    expect(result).toBe(true);
  });

  it('sitter with completed booking can see care_instructions and vaccinations', () => {
    db.prepare("INSERT INTO bookings (sitter_id, owner_id, status, start_time, end_time) VALUES (?, ?, ?, ?, ?)").run(2, 1, 'completed', '2026-04-08T10:00:00Z', '2026-04-08T11:00:00Z');
    db.prepare('INSERT INTO booking_pets (booking_id, pet_id) VALUES (?, ?)').run(1, 1);

    const result = canViewPrivate(2, 1, ['owner', 'sitter'], 1, db);
    expect(result).toBe(true);
  });

  it('unrelated user cannot see care_instructions and vaccinations', () => {
    const result = canViewPrivate(3, 1, ['owner'], 1, db);
    expect(result).toBe(false);
  });

  it('sitter with only pending booking cannot see private data', () => {
    db.prepare("INSERT INTO bookings (sitter_id, owner_id, status, start_time, end_time) VALUES (?, ?, ?, ?, ?)").run(2, 1, 'pending', '2026-04-10T10:00:00Z', '2026-04-10T11:00:00Z');
    db.prepare('INSERT INTO booking_pets (booking_id, pet_id) VALUES (?, ?)').run(1, 1);

    const result = canViewPrivate(2, 1, ['owner', 'sitter'], 1, db);
    expect(result).toBe(false);
  });

  it('sitter with cancelled booking cannot see private data', () => {
    db.prepare("INSERT INTO bookings (sitter_id, owner_id, status, start_time, end_time) VALUES (?, ?, ?, ?, ?)").run(2, 1, 'cancelled', '2026-04-10T10:00:00Z', '2026-04-10T11:00:00Z');
    db.prepare('INSERT INTO booking_pets (booking_id, pet_id) VALUES (?, ?)').run(1, 1);

    const result = canViewPrivate(2, 1, ['owner', 'sitter'], 1, db);
    expect(result).toBe(false);
  });
});
