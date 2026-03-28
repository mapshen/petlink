import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { generateICS, type ICSEvent } from './calendar-export';

// --- Token tests using better-sqlite3 in-memory DB ---
describe('calendar token management', () => {
  let testDb: ReturnType<typeof Database>;

  // Thin wrapper that mimics postgres tagged template usage for token operations
  function createSqlProxy(db: ReturnType<typeof Database>) {
    return function sql(strings: TemplateStringsArray, ...values: any[]) {
      let query = '';
      for (let i = 0; i < strings.length; i++) {
        query += strings[i];
        if (i < values.length) {
          query += '?';
        }
      }

      // Normalize PostgreSQL syntax to SQLite
      const isUpsert = query.includes('ON CONFLICT');
      query = query.replace(/ON CONFLICT \(user_id\) DO UPDATE SET token = \?, created_at = NOW\(\)/g,
        'ON CONFLICT (user_id) DO UPDATE SET token = excluded.token, created_at = CURRENT_TIMESTAMP');
      query = query.replace(/NOW\(\)/g, 'CURRENT_TIMESTAMP');
      query = query.replace(/TIMESTAMPTZ/g, 'TEXT');

      // Remove the extra value for the ON CONFLICT SET clause (the duplicated token param)
      const params = isUpsert ? values.slice(0, 2) : values;

      const trimmed = query.trim();
      if (trimmed.startsWith('INSERT') || trimmed.startsWith('DELETE')) {
        if (trimmed.includes('RETURNING')) {
          const withoutReturning = trimmed.replace(/RETURNING.*$/, '').trim();
          db.prepare(withoutReturning).run(...params);
          if (trimmed.startsWith('DELETE')) return [];
          // For INSERT/UPSERT RETURNING, query by user_id (first param)
          const selectResult = db.prepare('SELECT * FROM calendar_tokens WHERE user_id = ?').get(params[0]);
          return selectResult ? [selectResult] : [];
        }
        db.prepare(trimmed).run(...params);
        return [];
      }
      const rows = db.prepare(trimmed).all(...params);
      return rows;
    } as any;
  }

  let sqlProxy: ReturnType<typeof createSqlProxy>;

  beforeAll(() => {
    testDb = new Database(':memory:');
    testDb.pragma('foreign_keys = ON');
    testDb.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL
      );
      CREATE TABLE calendar_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token TEXT UNIQUE NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX idx_calendar_tokens_user ON calendar_tokens (user_id);
    `);
    testDb.prepare("INSERT INTO users (email, name) VALUES ('sitter@test.com', 'Test Sitter')").run();
    testDb.prepare("INSERT INTO users (email, name) VALUES ('sitter2@test.com', 'Test Sitter 2')").run();
    sqlProxy = createSqlProxy(testDb);
  });

  afterAll(() => {
    testDb.close();
  });

  it('generates a 64-char hex token', async () => {
    // Import the actual function dynamically to use with our sql proxy
    const { generateCalendarToken } = await import('./calendar-export');
    const token = await generateCalendarToken(sqlProxy, 1);
    expect(token).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(token)).toBe(true);
  });

  it('upserts token (generating twice for same user replaces old token)', async () => {
    const { generateCalendarToken } = await import('./calendar-export');
    const token1 = await generateCalendarToken(sqlProxy, 1);
    const token2 = await generateCalendarToken(sqlProxy, 1);
    expect(token1).not.toBe(token2);
    expect(token2).toHaveLength(64);

    // Only one row should exist for user 1
    const rows = testDb.prepare('SELECT * FROM calendar_tokens WHERE user_id = 1').all();
    expect(rows).toHaveLength(1);
  });

  it('validates a token and returns correct user_id', async () => {
    const { generateCalendarToken, validateCalendarToken } = await import('./calendar-export');
    const token = await generateCalendarToken(sqlProxy, 2);
    const userId = await validateCalendarToken(sqlProxy, token);
    expect(userId).toBe(2);
  });

  it('returns null for invalid token', async () => {
    const { validateCalendarToken } = await import('./calendar-export');
    const userId = await validateCalendarToken(sqlProxy, 'nonexistent-token-value');
    expect(userId).toBeNull();
  });

  it('revokes a token', async () => {
    const { generateCalendarToken, revokeCalendarToken, validateCalendarToken } = await import('./calendar-export');
    const token = await generateCalendarToken(sqlProxy, 1);
    await revokeCalendarToken(sqlProxy, 1);
    const userId = await validateCalendarToken(sqlProxy, token);
    expect(userId).toBeNull();
  });

  it('getCalendarToken returns existing token', async () => {
    const { generateCalendarToken, getCalendarToken } = await import('./calendar-export');
    const generated = await generateCalendarToken(sqlProxy, 1);
    const retrieved = await getCalendarToken(sqlProxy, 1);
    expect(retrieved).toBe(generated);
  });

  it('getCalendarToken returns null when no token exists', async () => {
    const { getCalendarToken, revokeCalendarToken } = await import('./calendar-export');
    await revokeCalendarToken(sqlProxy, 1);
    const token = await getCalendarToken(sqlProxy, 1);
    expect(token).toBeNull();
  });
});

// --- ICS generation tests (pure functions, no DB needed) ---
describe('generateICS', () => {
  it('produces valid VCALENDAR wrapper', () => {
    const ics = generateICS([], 'Test Sitter');
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).toContain('PRODID:-//PetLink//Calendar//EN');
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('CALSCALE:GREGORIAN');
    expect(ics).toContain('METHOD:PUBLISH');
    expect(ics).toContain("X-WR-CALNAME:Test Sitter's PetLink Calendar");
  });

  it('booking events have correct UID, DTSTART/DTEND, SUMMARY', () => {
    const events: ICSEvent[] = [{
      id: 42,
      type: 'booking',
      title: 'walking - Alice',
      description: 'Pets: Buddy\nService: walking',
      start: new Date('2026-04-01T10:00:00Z'),
      end: new Date('2026-04-01T11:00:00Z'),
      status: 'confirmed',
      categories: ['BOOKING'],
    }];
    const ics = generateICS(events, 'Bob');
    expect(ics).toContain('UID:booking-42@petlink.app');
    expect(ics).toContain('DTSTART:20260401T100000Z');
    expect(ics).toContain('DTEND:20260401T110000Z');
    expect(ics).toContain('SUMMARY:walking - Alice');
    expect(ics).toContain('DESCRIPTION:Pets: Buddy\\nService: walking');
    expect(ics).toContain('STATUS:CONFIRMED');
    expect(ics).toContain('CATEGORIES:BOOKING');
  });

  it('availability events have CATEGORIES:AVAILABILITY', () => {
    const events: ICSEvent[] = [{
      id: 7,
      type: 'availability',
      title: 'Available',
      start: new Date('2026-04-02T09:00:00Z'),
      end: new Date('2026-04-02T17:00:00Z'),
      status: 'confirmed',
      categories: ['AVAILABILITY'],
    }];
    const ics = generateICS(events, 'Sitter');
    expect(ics).toContain('UID:availability-7@petlink.app');
    expect(ics).toContain('CATEGORIES:AVAILABILITY');
  });

  it('empty events produces valid but empty calendar', () => {
    const ics = generateICS([], 'Empty Sitter');
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).not.toContain('BEGIN:VEVENT');
  });

  it('uses \\r\\n line endings', () => {
    const ics = generateICS([], 'Test');
    const lines = ics.split('\r\n');
    // Should have at least the calendar wrapper lines + trailing empty
    expect(lines.length).toBeGreaterThanOrEqual(7);
    // No bare \n without preceding \r
    const withoutCRLF = ics.replace(/\r\n/g, '');
    expect(withoutCRLF).not.toContain('\n');
  });

  it('DTSTART/DTEND use UTC Z format', () => {
    const events: ICSEvent[] = [{
      id: 1,
      type: 'booking',
      title: 'Test',
      start: new Date('2026-06-15T14:30:00Z'),
      end: new Date('2026-06-15T15:45:00Z'),
      status: 'confirmed',
    }];
    const ics = generateICS(events, 'Sitter');
    expect(ics).toContain('DTSTART:20260615T143000Z');
    expect(ics).toContain('DTEND:20260615T154500Z');
  });

  it('maps pending booking status to TENTATIVE', () => {
    const events: ICSEvent[] = [{
      id: 3,
      type: 'booking',
      title: 'Pending walk',
      start: new Date('2026-04-01T10:00:00Z'),
      end: new Date('2026-04-01T11:00:00Z'),
      status: 'tentative',
    }];
    const ics = generateICS(events, 'Sitter');
    expect(ics).toContain('STATUS:TENTATIVE');
  });

  it('maps cancelled booking status to CANCELLED', () => {
    const events: ICSEvent[] = [{
      id: 4,
      type: 'booking',
      title: 'Cancelled',
      start: new Date('2026-04-01T10:00:00Z'),
      end: new Date('2026-04-01T11:00:00Z'),
      status: 'cancelled',
    }];
    const ics = generateICS(events, 'Sitter');
    expect(ics).toContain('STATUS:CANCELLED');
  });

  it('folds long lines at 75 characters', () => {
    const longTitle = 'A'.repeat(100);
    const events: ICSEvent[] = [{
      id: 5,
      type: 'booking',
      title: longTitle,
      start: new Date('2026-04-01T10:00:00Z'),
      end: new Date('2026-04-01T11:00:00Z'),
    }];
    const ics = generateICS(events, 'Sitter');
    const physicalLines = ics.split('\r\n');
    for (const line of physicalLines) {
      // Each physical line (including continuation) must be <= 75 bytes
      expect(line.length).toBeLessThanOrEqual(75);
    }
  });

  it('escapes special characters in text fields', () => {
    const events: ICSEvent[] = [{
      id: 6,
      type: 'booking',
      title: 'Walk; with, commas',
      description: 'Line1\nLine2',
      start: new Date('2026-04-01T10:00:00Z'),
      end: new Date('2026-04-01T11:00:00Z'),
    }];
    const ics = generateICS(events, 'Sitter');
    expect(ics).toContain('Walk\\; with\\, commas');
    expect(ics).toContain('Line1\\nLine2');
  });
});
