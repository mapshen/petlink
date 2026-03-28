import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import type { CalendarEvent } from '../types.ts';

// --- In-memory SQLite test DB ---

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL DEFAULT 'hash',
      name TEXT NOT NULL,
      role TEXT DEFAULT 'owner',
      bio TEXT,
      avatar_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE pets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      species TEXT DEFAULT 'dog'
    );
    CREATE TABLE services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sitter_id INTEGER NOT NULL REFERENCES users(id),
      type TEXT NOT NULL,
      price REAL NOT NULL
    );
    CREATE TABLE bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sitter_id INTEGER NOT NULL REFERENCES users(id),
      owner_id INTEGER NOT NULL REFERENCES users(id),
      pet_id INTEGER,
      service_id INTEGER REFERENCES services(id),
      status TEXT DEFAULT 'pending',
      start_time DATETIME NOT NULL,
      end_time DATETIME NOT NULL,
      total_price REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE booking_pets (
      booking_id INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
      PRIMARY KEY (booking_id, pet_id)
    );
    CREATE TABLE availability (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sitter_id INTEGER NOT NULL REFERENCES users(id),
      day_of_week INTEGER CHECK(day_of_week >= 0 AND day_of_week <= 6),
      specific_date TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      recurring INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Seed users
  db.prepare("INSERT INTO users (email, name, role, avatar_url) VALUES (?, ?, ?, ?)").run('owner@test.com', 'Alice', 'owner', 'https://example.com/alice.jpg');
  db.prepare("INSERT INTO users (email, name, role) VALUES (?, ?, ?)").run('sitter@test.com', 'Bob', 'sitter');

  // Seed pets
  db.prepare("INSERT INTO pets (owner_id, name) VALUES (?, ?)").run(1, 'Buddy');
  db.prepare("INSERT INTO pets (owner_id, name) VALUES (?, ?)").run(1, 'Max');

  // Seed service
  db.prepare("INSERT INTO services (sitter_id, type, price) VALUES (?, ?, ?)").run(2, 'boarding', 45);

  return db;
}

/**
 * Build a fake sql tagged-template function backed by better-sqlite3.
 * Handles:
 *  - sql`SELECT ... WHERE x = ${val}` (parameterised queries)
 *  - sql(arrayOfIds) for IN-clause expansion
 */
function makeSql(db: ReturnType<typeof createTestDb>) {
  function sql(strings: TemplateStringsArray, ...values: any[]): any[] {
    let query = '';
    const params: any[] = [];

    for (let i = 0; i < strings.length; i++) {
      query += strings[i];
      if (i < values.length) {
        const val = values[i];
        // Handle sql(array) expansion from the calendar module's sql`WHERE x IN ${sql(ids)}`
        if (val && typeof val === 'object' && val.__sqlExpanded) {
          query += val.fragment;
          params.push(...val.params);
        } else {
          query += '?';
          params.push(val);
        }
      }
    }

    const trimmed = query.trim();
    if (/^(INSERT|UPDATE|DELETE)/i.test(trimmed)) {
      db.prepare(trimmed).run(...params);
      return [];
    }
    return db.prepare(trimmed).all(...params);
  }

  // sql(array) — used for IN-clause expansion: sql`WHERE id IN ${sql(ids)}`
  sql.call = undefined; // satisfy type
  const proxy = new Proxy(sql, {
    apply(_target, _thisArg, args) {
      // Tagged template call: args[0] is TemplateStringsArray (has .raw)
      if (args[0] && Array.isArray(args[0]) && 'raw' in args[0]) {
        return sql(args[0] as TemplateStringsArray, ...args.slice(1));
      }
      // Direct call: sql([1,2,3]) for IN expansion
      if (Array.isArray(args[0])) {
        const arr = args[0] as any[];
        const placeholders = arr.map(() => '?').join(', ');
        return { __sqlExpanded: true, fragment: `(${placeholders})`, params: arr };
      }
      return sql(args[0] as TemplateStringsArray, ...args.slice(1));
    },
  });

  return proxy as any;
}

// --- Tests ---

describe('getCalendarData', () => {
  let db: ReturnType<typeof createTestDb>;
  let sqlFn: ReturnType<typeof makeSql>;

  // Import lazily so module-level db import doesn't interfere
  let getCalendarData: (sql: any, sitterId: number, rangeStart: string, rangeEnd: string) => Promise<CalendarEvent[]>;

  beforeEach(async () => {
    db = createTestDb();
    sqlFn = makeSql(db);
    const mod = await import('./calendar.ts');
    getCalendarData = mod.getCalendarData;
  });

  it('returns bookings within range with correct fields', async () => {
    db.prepare("INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)").run(2, 1, 1, 'confirmed', '2025-03-15T10:00:00Z', '2025-03-15T18:00:00Z');
    db.prepare("INSERT INTO booking_pets (booking_id, pet_id) VALUES (?, ?)").run(1, 1);

    const events = await getCalendarData(sqlFn, 2, '2025-03-01', '2025-04-01');
    const booking = events.find((e) => e.type === 'booking');

    expect(booking).toBeDefined();
    expect(booking!.title).toBe("Alice's boarding");
    expect(booking!.status).toBe('confirmed');
    expect(booking!.owner_name).toBe('Alice');
    expect(booking!.service_type).toBe('boarding');
  });

  it('excludes bookings outside the range', async () => {
    db.prepare("INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)").run(2, 1, 1, 'confirmed', '2025-01-10T10:00:00Z', '2025-01-10T18:00:00Z');

    const events = await getCalendarData(sqlFn, 2, '2025-03-01', '2025-04-01');
    expect(events.filter((e) => e.type === 'booking')).toHaveLength(0);
  });

  it('includes cancelled bookings (all statuses)', async () => {
    db.prepare("INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)").run(2, 1, 1, 'cancelled', '2025-03-20T09:00:00Z', '2025-03-20T17:00:00Z');

    const events = await getCalendarData(sqlFn, 2, '2025-03-01', '2025-04-01');
    const cancelled = events.find((e) => e.type === 'booking');
    expect(cancelled).toBeDefined();
    expect(cancelled!.status).toBe('cancelled');
  });

  it('expands recurring availability into concrete dates within range', async () => {
    // day_of_week=1 is Monday. March 2025 has Mondays on 3, 10, 17, 24, 31
    db.prepare("INSERT INTO availability (sitter_id, day_of_week, start_time, end_time, recurring) VALUES (?, ?, ?, ?, ?)").run(2, 1, '09:00', '17:00', 1);

    const events = await getCalendarData(sqlFn, 2, '2025-03-01', '2025-04-01');
    const avails = events.filter((e) => e.type === 'availability');

    // Mondays in March 2025: 3, 10, 17, 24, 31
    expect(avails).toHaveLength(5);
    expect(avails.every((e) => e.title === 'Available')).toBe(true);
    expect(avails.every((e) => e.recurring === true)).toBe(true);
    expect(avails[0].start).toContain('2025-03-03');
  });

  it('includes specific-date availability when in range', async () => {
    db.prepare("INSERT INTO availability (sitter_id, specific_date, start_time, end_time, recurring) VALUES (?, ?, ?, ?, ?)").run(2, '2025-03-15', '10:00', '14:00', 0);

    const events = await getCalendarData(sqlFn, 2, '2025-03-01', '2025-04-01');
    const avail = events.find((e) => e.type === 'availability');

    expect(avail).toBeDefined();
    expect(avail!.recurring).toBe(false);
    expect(avail!.start).toContain('2025-03-15');
    expect(avail!.start).toContain('10:00');
  });

  it('excludes specific-date availability outside range', async () => {
    db.prepare("INSERT INTO availability (sitter_id, specific_date, start_time, end_time, recurring) VALUES (?, ?, ?, ?, ?)").run(2, '2025-01-15', '10:00', '14:00', 0);

    const events = await getCalendarData(sqlFn, 2, '2025-03-01', '2025-04-01');
    expect(events.filter((e) => e.type === 'availability')).toHaveLength(0);
  });

  it('sorts all events by start time', async () => {
    // Later booking
    db.prepare("INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)").run(2, 1, 1, 'confirmed', '2025-03-20T10:00:00Z', '2025-03-20T18:00:00Z');
    // Earlier booking
    db.prepare("INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)").run(2, 1, 1, 'pending', '2025-03-05T08:00:00Z', '2025-03-05T12:00:00Z');
    // Availability in between
    db.prepare("INSERT INTO availability (sitter_id, specific_date, start_time, end_time, recurring) VALUES (?, ?, ?, ?, ?)").run(2, '2025-03-10', '09:00', '17:00', 0);

    const events = await getCalendarData(sqlFn, 2, '2025-03-01', '2025-04-01');

    for (let i = 1; i < events.length; i++) {
      expect(new Date(events[i].start).getTime()).toBeGreaterThanOrEqual(new Date(events[i - 1].start).getTime());
    }
  });

  it('returns empty array for empty range', async () => {
    const events = await getCalendarData(sqlFn, 2, '2025-03-01', '2025-04-01');
    expect(events).toEqual([]);
  });

  it('includes pet names from booking_pets join', async () => {
    db.prepare("INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)").run(2, 1, 1, 'confirmed', '2025-03-15T10:00:00Z', '2025-03-15T18:00:00Z');
    db.prepare("INSERT INTO booking_pets (booking_id, pet_id) VALUES (?, ?)").run(1, 1);
    db.prepare("INSERT INTO booking_pets (booking_id, pet_id) VALUES (?, ?)").run(1, 2);

    const events = await getCalendarData(sqlFn, 2, '2025-03-01', '2025-04-01');
    const booking = events.find((e) => e.type === 'booking');

    expect(booking!.pet_names).toBeDefined();
    expect(booking!.pet_names!.sort()).toEqual(['Buddy', 'Max']);
  });
});
