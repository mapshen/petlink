import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { bookingFiltersSchema } from './validation.ts';

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
      avatar_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE pets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      species TEXT DEFAULT 'dog',
      photo_url TEXT,
      breed TEXT
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
  `);

  // Seed users
  db.prepare("INSERT INTO users (email, name, role) VALUES (?, ?, ?)").run('owner@test.com', 'Alice Owner', 'owner');
  db.prepare("INSERT INTO users (email, name, role) VALUES (?, ?, ?)").run('sitter@test.com', 'Bob Sitter', 'sitter');
  db.prepare("INSERT INTO users (email, name, role) VALUES (?, ?, ?)").run('owner2@test.com', 'Carol Owner', 'owner');

  // Seed pets
  db.prepare("INSERT INTO pets (owner_id, name, breed) VALUES (?, ?, ?)").run(1, 'Buddy', 'Labrador');
  db.prepare("INSERT INTO pets (owner_id, name, breed) VALUES (?, ?, ?)").run(3, 'Max', 'Poodle');

  // Seed services
  db.prepare("INSERT INTO services (sitter_id, type, price) VALUES (?, ?, ?)").run(2, 'walking', 25);

  return db;
}

/**
 * Simulate the GET /bookings query logic against SQLite.
 * Mirrors the conditional WHERE clause construction from server.ts.
 */
function queryBookings(
  db: ReturnType<typeof createTestDb>,
  userId: number,
  userRole: string,
  filters: { start?: string; end?: string; status?: string; search?: string; limit: number; offset: number },
) {
  const conditions: string[] = ['(b.owner_id = ? OR b.sitter_id = ?)'];
  const params: unknown[] = [userId, userId];

  if (filters.start) {
    conditions.push('b.start_time >= ?');
    params.push(filters.start);
  }
  if (filters.end) {
    conditions.push('b.start_time < ?');
    params.push(filters.end);
  }
  if (filters.status) {
    conditions.push('b.status = ?');
    params.push(filters.status);
  }
  if (filters.search) {
    const pattern = `%${filters.search}%`;
    if (userRole === 'sitter') {
      conditions.push('o.name LIKE ?');
      params.push(pattern);
    } else if (userRole === 'owner') {
      conditions.push('s.name LIKE ?');
      params.push(pattern);
    } else {
      conditions.push('(o.name LIKE ? OR s.name LIKE ?)');
      params.push(pattern, pattern);
    }
  }

  const whereClause = conditions.join(' AND ');

  // Count query
  const countRow = db.prepare(`
    SELECT COUNT(*) AS count
    FROM bookings b
    JOIN users s ON b.sitter_id = s.id
    JOIN users o ON b.owner_id = o.id
    JOIN services svc ON b.service_id = svc.id
    WHERE ${whereClause}
  `).get(...params) as { count: number };

  // Data query
  const bookings = db.prepare(`
    SELECT b.*,
           s.name as sitter_name, s.avatar_url as sitter_avatar,
           o.name as owner_name, o.avatar_url as owner_avatar,
           svc.type as service_type
    FROM bookings b
    JOIN users s ON b.sitter_id = s.id
    JOIN users o ON b.owner_id = o.id
    JOIN services svc ON b.service_id = svc.id
    WHERE ${whereClause}
    ORDER BY b.start_time DESC
    LIMIT ? OFFSET ?
  `).all(...params, filters.limit, filters.offset) as Record<string, unknown>[];

  // Batch-fetch pets
  const bookingIds = bookings.map((b) => b.id as number);
  const bookingPets = bookingIds.length > 0
    ? db.prepare(`
        SELECT bp.booking_id, p.id, p.name, p.photo_url, p.breed
        FROM booking_pets bp
        JOIN pets p ON bp.pet_id = p.id
        WHERE bp.booking_id IN (${bookingIds.map(() => '?').join(',')})
      `).all(...bookingIds) as { booking_id: number; id: number; name: string; photo_url: string | null; breed: string | null }[]
    : [];

  const petsByBooking = bookingPets.reduce(
    (acc: Map<number, { id: number; name: string; photo_url: string | null; breed: string | null }[]>, row) => {
      const existing = acc.get(row.booking_id) ?? [];
      return new Map([...acc, [row.booking_id, [...existing, { id: row.id, name: row.name, photo_url: row.photo_url, breed: row.breed }]]]);
    },
    new Map(),
  );

  const enriched: (Record<string, unknown> & { pets: { id: number; name: string; photo_url: string | null; breed: string | null }[] })[] =
    bookings.map((b) => ({
      ...b,
      pets: petsByBooking.get(b.id as number) ?? [],
    }));

  return { bookings: enriched, total: countRow.count };
}

// --- Tests ---

describe('booking filters', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();

    // Seed bookings with different dates and statuses
    // Owner 1 (Alice) books sitter 2 (Bob)
    db.prepare("INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time, total_price) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      2, 1, 1, 'completed', '2025-01-15T10:00:00Z', '2025-01-15T11:00:00Z', 25,
    );
    db.prepare("INSERT INTO booking_pets (booking_id, pet_id) VALUES (?, ?)").run(1, 1);

    db.prepare("INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time, total_price) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      2, 1, 1, 'pending', '2025-03-10T09:00:00Z', '2025-03-10T10:00:00Z', 25,
    );
    db.prepare("INSERT INTO booking_pets (booking_id, pet_id) VALUES (?, ?)").run(2, 1);

    db.prepare("INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time, total_price) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      2, 1, 1, 'cancelled', '2025-06-01T14:00:00Z', '2025-06-01T15:00:00Z', 25,
    );

    // Owner 3 (Carol) books sitter 2 (Bob)
    db.prepare("INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time, total_price) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      2, 3, 1, 'confirmed', '2025-04-20T08:00:00Z', '2025-04-20T09:00:00Z', 25,
    );
    db.prepare("INSERT INTO booking_pets (booking_id, pet_id) VALUES (?, ?)").run(4, 2);
  });

  describe('default behavior (no filters)', () => {
    it('returns all bookings for owner', () => {
      const result = queryBookings(db, 1, 'owner', { limit: 20, offset: 0 });
      expect(result.bookings).toHaveLength(3);
      expect(result.total).toBe(3);
    });

    it('returns all bookings for sitter', () => {
      const result = queryBookings(db, 2, 'sitter', { limit: 20, offset: 0 });
      expect(result.bookings).toHaveLength(4);
      expect(result.total).toBe(4);
    });

    it('includes pets in response', () => {
      const result = queryBookings(db, 1, 'owner', { limit: 20, offset: 0 });
      const withPets = result.bookings.filter((b) => (b.pets as unknown[]).length > 0);
      expect(withPets).toHaveLength(2);
      expect((withPets[0].pets as { name: string }[])[0].name).toBe('Buddy');
    });

    it('includes total count in response', () => {
      const result = queryBookings(db, 2, 'sitter', { limit: 20, offset: 0 });
      expect(result.total).toBe(4);
    });
  });

  describe('date range filtering', () => {
    it('filters by start date', () => {
      const result = queryBookings(db, 2, 'sitter', { start: '2025-03-01', limit: 20, offset: 0 });
      expect(result.bookings).toHaveLength(3);
      expect(result.total).toBe(3);
    });

    it('filters by end date', () => {
      const result = queryBookings(db, 2, 'sitter', { end: '2025-04-01', limit: 20, offset: 0 });
      expect(result.bookings).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('filters by both start and end', () => {
      const result = queryBookings(db, 2, 'sitter', { start: '2025-03-01', end: '2025-05-01', limit: 20, offset: 0 });
      expect(result.bookings).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it('returns empty when no bookings in range', () => {
      const result = queryBookings(db, 2, 'sitter', { start: '2026-01-01', end: '2026-12-31', limit: 20, offset: 0 });
      expect(result.bookings).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('status filtering', () => {
    it('filters by completed status', () => {
      const result = queryBookings(db, 2, 'sitter', { status: 'completed', limit: 20, offset: 0 });
      expect(result.bookings).toHaveLength(1);
      expect(result.bookings[0].status).toBe('completed');
    });

    it('filters by pending status', () => {
      const result = queryBookings(db, 2, 'sitter', { status: 'pending', limit: 20, offset: 0 });
      expect(result.bookings).toHaveLength(1);
      expect(result.bookings[0].status).toBe('pending');
    });

    it('filters by cancelled status', () => {
      const result = queryBookings(db, 2, 'sitter', { status: 'cancelled', limit: 20, offset: 0 });
      expect(result.bookings).toHaveLength(1);
      expect(result.bookings[0].status).toBe('cancelled');
    });

    it('filters by confirmed status', () => {
      const result = queryBookings(db, 2, 'sitter', { status: 'confirmed', limit: 20, offset: 0 });
      expect(result.bookings).toHaveLength(1);
      expect(result.bookings[0].status).toBe('confirmed');
    });

    it('returns empty for status with no matches', () => {
      const result = queryBookings(db, 2, 'sitter', { status: 'in_progress', limit: 20, offset: 0 });
      expect(result.bookings).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('search filtering (ILIKE)', () => {
    it('sitter searches by owner name', () => {
      const result = queryBookings(db, 2, 'sitter', { search: 'Alice', limit: 20, offset: 0 });
      expect(result.bookings).toHaveLength(3);
      expect(result.total).toBe(3);
    });

    it('sitter search is case-insensitive (SQLite LIKE)', () => {
      const result = queryBookings(db, 2, 'sitter', { search: 'alice', limit: 20, offset: 0 });
      // SQLite LIKE is case-insensitive for ASCII by default
      expect(result.bookings).toHaveLength(3);
    });

    it('sitter search filters to specific owner', () => {
      const result = queryBookings(db, 2, 'sitter', { search: 'Carol', limit: 20, offset: 0 });
      expect(result.bookings).toHaveLength(1);
      expect(result.bookings[0].owner_name).toBe('Carol Owner');
    });

    it('owner searches by sitter name', () => {
      const result = queryBookings(db, 1, 'owner', { search: 'Bob', limit: 20, offset: 0 });
      expect(result.bookings).toHaveLength(3);
      expect(result.total).toBe(3);
    });

    it('search returns empty for no matches', () => {
      const result = queryBookings(db, 2, 'sitter', { search: 'Nonexistent', limit: 20, offset: 0 });
      expect(result.bookings).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('pagination (limit/offset)', () => {
    it('limits results', () => {
      const result = queryBookings(db, 2, 'sitter', { limit: 2, offset: 0 });
      expect(result.bookings).toHaveLength(2);
      expect(result.total).toBe(4);
    });

    it('offsets results', () => {
      const result = queryBookings(db, 2, 'sitter', { limit: 2, offset: 2 });
      expect(result.bookings).toHaveLength(2);
      expect(result.total).toBe(4);
    });

    it('returns remaining when offset + limit exceeds total', () => {
      const result = queryBookings(db, 2, 'sitter', { limit: 10, offset: 3 });
      expect(result.bookings).toHaveLength(1);
      expect(result.total).toBe(4);
    });

    it('returns empty when offset exceeds total', () => {
      const result = queryBookings(db, 2, 'sitter', { limit: 20, offset: 100 });
      expect(result.bookings).toHaveLength(0);
      expect(result.total).toBe(4);
    });
  });

  describe('total count with filters', () => {
    it('total reflects status filter', () => {
      const result = queryBookings(db, 2, 'sitter', { status: 'completed', limit: 20, offset: 0 });
      expect(result.total).toBe(1);
    });

    it('total reflects date range filter', () => {
      const result = queryBookings(db, 2, 'sitter', { start: '2025-03-01', end: '2025-05-01', limit: 20, offset: 0 });
      expect(result.total).toBe(2);
    });

    it('total reflects search filter', () => {
      const result = queryBookings(db, 2, 'sitter', { search: 'Carol', limit: 20, offset: 0 });
      expect(result.total).toBe(1);
    });

    it('total reflects combined filters', () => {
      const result = queryBookings(db, 2, 'sitter', { status: 'completed', start: '2025-01-01', end: '2025-12-31', limit: 20, offset: 0 });
      expect(result.total).toBe(1);
    });

    it('total is independent of limit/offset', () => {
      const result = queryBookings(db, 2, 'sitter', { limit: 1, offset: 0 });
      expect(result.bookings).toHaveLength(1);
      expect(result.total).toBe(4);
    });
  });
});

describe('bookingFiltersSchema validation', () => {
  it('accepts empty query (all defaults)', () => {
    const result = bookingFiltersSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(20);
      expect(result.data.offset).toBe(0);
    }
  });

  it('accepts valid date range', () => {
    const result = bookingFiltersSchema.safeParse({ start: '2025-01-01', end: '2025-12-31' });
    expect(result.success).toBe(true);
  });

  it('accepts valid status', () => {
    const result = bookingFiltersSchema.safeParse({ status: 'completed' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status', () => {
    const result = bookingFiltersSchema.safeParse({ status: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid date format', () => {
    const result = bookingFiltersSchema.safeParse({ start: '01-01-2025' });
    expect(result.success).toBe(false);
  });

  it('clamps limit to max 100', () => {
    const result = bookingFiltersSchema.safeParse({ limit: '200' });
    expect(result.success).toBe(false);
  });

  it('coerces string limit to number', () => {
    const result = bookingFiltersSchema.safeParse({ limit: '50' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(50);
    }
  });

  it('rejects negative offset', () => {
    const result = bookingFiltersSchema.safeParse({ offset: '-1' });
    expect(result.success).toBe(false);
  });

  it('accepts search string', () => {
    const result = bookingFiltersSchema.safeParse({ search: 'Alice' });
    expect(result.success).toBe(true);
  });

  it('rejects search string over 100 chars', () => {
    const result = bookingFiltersSchema.safeParse({ search: 'a'.repeat(101) });
    expect(result.success).toBe(false);
  });

  it('accepts all valid params together', () => {
    const result = bookingFiltersSchema.safeParse({
      start: '2025-01-01',
      end: '2025-12-31',
      status: 'pending',
      search: 'Alice',
      limit: '10',
      offset: '5',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        start: '2025-01-01',
        end: '2025-12-31',
        status: 'pending',
        search: 'Alice',
        limit: 10,
        offset: 5,
      });
    }
  });
});
