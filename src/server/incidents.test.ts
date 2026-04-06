import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { createIncidentSchema } from './validation';

describe('incident reporting', () => {
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
        roles TEXT DEFAULT 'owner',
        avatar_url TEXT
      );
      CREATE TABLE bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sitter_id INTEGER NOT NULL,
        owner_id INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        FOREIGN KEY (sitter_id) REFERENCES users(id),
        FOREIGN KEY (owner_id) REFERENCES users(id)
      );
      CREATE TABLE incident_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id INTEGER NOT NULL,
        reporter_id INTEGER NOT NULL,
        category TEXT NOT NULL CHECK(category IN ('pet_injury', 'property_damage', 'safety_concern', 'behavioral_issue', 'service_issue', 'other')),
        description TEXT NOT NULL,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
        FOREIGN KEY (reporter_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE incident_evidence (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        incident_id INTEGER NOT NULL,
        media_url TEXT NOT NULL,
        media_type TEXT NOT NULL CHECK(media_type IN ('image', 'video')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (incident_id) REFERENCES incident_reports(id) ON DELETE CASCADE
      );
    `);

    // Owner (id=1)
    testDb.prepare("INSERT INTO users (email, password_hash, name, roles) VALUES ('owner@test.com', 'hash', 'Test Owner', 'owner')").run();
    // Sitter (id=2)
    testDb.prepare("INSERT INTO users (email, password_hash, name, roles) VALUES ('sitter@test.com', 'hash', 'Test Sitter', 'owner,sitter')").run();
    // Unrelated user (id=3)
    testDb.prepare("INSERT INTO users (email, password_hash, name, roles) VALUES ('other@test.com', 'hash', 'Other User', 'owner')").run();

    // Confirmed booking (id=1)
    testDb.prepare("INSERT INTO bookings (sitter_id, owner_id, status, start_time, end_time) VALUES (2, 1, 'confirmed', '2026-04-10T10:00:00Z', '2026-04-10T11:00:00Z')").run();
    // In-progress booking (id=2)
    testDb.prepare("INSERT INTO bookings (sitter_id, owner_id, status, start_time, end_time) VALUES (2, 1, 'in_progress', '2026-04-11T10:00:00Z', '2026-04-11T11:00:00Z')").run();
    // Completed booking (id=3)
    testDb.prepare("INSERT INTO bookings (sitter_id, owner_id, status, start_time, end_time) VALUES (2, 1, 'completed', '2026-04-08T10:00:00Z', '2026-04-08T11:00:00Z')").run();
    // Pending booking (id=4)
    testDb.prepare("INSERT INTO bookings (sitter_id, owner_id, status, start_time, end_time) VALUES (2, 1, 'pending', '2026-04-15T10:00:00Z', '2026-04-15T11:00:00Z')").run();
  });

  afterAll(() => {
    testDb.close();
  });

  // --- Incident Report CRUD ---

  it('owner can create incident on confirmed booking', () => {
    const info = testDb.prepare(
      "INSERT INTO incident_reports (booking_id, reporter_id, category, description, notes) VALUES (1, 1, 'pet_injury', 'Cat has a scratch on ear', 'Noticed after pickup')"
    ).run();
    expect(info.changes).toBe(1);

    const report = testDb.prepare('SELECT * FROM incident_reports WHERE id = 1').get() as any;
    expect(report.booking_id).toBe(1);
    expect(report.reporter_id).toBe(1);
    expect(report.category).toBe('pet_injury');
    expect(report.description).toBe('Cat has a scratch on ear');
    expect(report.notes).toBe('Noticed after pickup');
  });

  it('sitter can create incident on confirmed booking', () => {
    const info = testDb.prepare(
      "INSERT INTO incident_reports (booking_id, reporter_id, category, description) VALUES (1, 2, 'behavioral_issue', 'Dog was aggressive at feeding time')"
    ).run();
    expect(info.changes).toBe(1);
  });

  it('can create incident on in_progress booking', () => {
    const info = testDb.prepare(
      "INSERT INTO incident_reports (booking_id, reporter_id, category, description) VALUES (2, 1, 'safety_concern', 'Fence has a gap')"
    ).run();
    expect(info.changes).toBe(1);
  });

  it('all 6 categories are valid', () => {
    const categories = ['pet_injury', 'property_damage', 'safety_concern', 'behavioral_issue', 'service_issue', 'other'];
    for (const cat of categories) {
      const info = testDb.prepare(
        "INSERT INTO incident_reports (booking_id, reporter_id, category, description) VALUES (1, 1, ?, 'Test')"
      ).run(cat);
      expect(info.changes).toBe(1);
    }
  });

  it('rejects invalid category', () => {
    expect(() => {
      testDb.prepare(
        "INSERT INTO incident_reports (booking_id, reporter_id, category, description) VALUES (1, 1, 'invalid_cat', 'Test')"
      ).run();
    }).toThrow();
  });

  it('query by booking_id returns all incidents', () => {
    const incidents = testDb.prepare(
      'SELECT * FROM incident_reports WHERE booking_id = 1 ORDER BY created_at'
    ).all() as any[];
    expect(incidents.length).toBeGreaterThanOrEqual(2);
  });

  // --- Evidence ---

  it('can attach evidence to an incident', () => {
    testDb.prepare(
      "INSERT INTO incident_evidence (incident_id, media_url, media_type) VALUES (1, 'https://s3.example.com/photo1.jpg', 'image')"
    ).run();
    testDb.prepare(
      "INSERT INTO incident_evidence (incident_id, media_url, media_type) VALUES (1, 'https://s3.example.com/video1.mp4', 'video')"
    ).run();

    const evidence = testDb.prepare('SELECT * FROM incident_evidence WHERE incident_id = 1').all() as any[];
    expect(evidence).toHaveLength(2);
    expect(evidence[0].media_type).toBe('image');
    expect(evidence[1].media_type).toBe('video');
  });

  it('rejects invalid media_type', () => {
    expect(() => {
      testDb.prepare(
        "INSERT INTO incident_evidence (incident_id, media_url, media_type) VALUES (1, 'https://s3.example.com/doc.pdf', 'document')"
      ).run();
    }).toThrow();
  });

  it('deleting incident cascades to evidence', () => {
    // Get current evidence count for incident 1
    const before = testDb.prepare('SELECT COUNT(*) as c FROM incident_evidence WHERE incident_id = 1').get() as any;
    expect(before.c).toBeGreaterThan(0);

    testDb.prepare('DELETE FROM incident_reports WHERE id = 1').run();

    const after = testDb.prepare('SELECT COUNT(*) as c FROM incident_evidence WHERE incident_id = 1').get() as any;
    expect(after.c).toBe(0);
  });

  it('deleting booking cascades to incidents and evidence', () => {
    // Create incident with evidence on booking 2
    testDb.prepare(
      "INSERT INTO incident_reports (booking_id, reporter_id, category, description) VALUES (2, 1, 'other', 'Test cascade')"
    ).run();
    const [incident] = testDb.prepare('SELECT id FROM incident_reports WHERE description = ?').all('Test cascade') as any[];
    testDb.prepare(
      "INSERT INTO incident_evidence (incident_id, media_url, media_type) VALUES (?, 'https://s3.example.com/test.jpg', 'image')"
    ).run(incident.id);

    // Delete the booking
    testDb.prepare('DELETE FROM bookings WHERE id = 2').run();

    const incidents = testDb.prepare('SELECT * FROM incident_reports WHERE booking_id = 2').all();
    expect(incidents).toHaveLength(0);

    const evidence = testDb.prepare('SELECT * FROM incident_evidence WHERE incident_id = ?').all(incident.id);
    expect(evidence).toHaveLength(0);
  });

  it('query joins reporter name and avatar', () => {
    // Create a fresh incident
    testDb.prepare(
      "INSERT INTO incident_reports (booking_id, reporter_id, category, description) VALUES (1, 2, 'service_issue', 'Late arrival')"
    ).run();

    const [incident] = testDb.prepare(`
      SELECT ir.*, u.name as reporter_name, u.avatar_url as reporter_avatar
      FROM incident_reports ir
      JOIN users u ON ir.reporter_id = u.id
      WHERE ir.description = 'Late arrival'
    `).all() as any[];

    expect(incident.reporter_name).toBe('Test Sitter');
  });
});

describe('createIncidentSchema validation', () => {
  it('accepts valid incident report', () => {
    const result = createIncidentSchema.safeParse({
      booking_id: 1,
      category: 'pet_injury',
      description: 'Cat has a scratch',
    });
    expect(result.success).toBe(true);
  });

  it('accepts report with evidence', () => {
    const result = createIncidentSchema.safeParse({
      booking_id: 1,
      category: 'pet_injury',
      description: 'Cat has a scratch',
      evidence: [
        { media_url: 'https://s3.example.com/photo.jpg', media_type: 'image' },
        { media_url: 'https://s3.example.com/video.mp4', media_type: 'video' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid category', () => {
    const result = createIncidentSchema.safeParse({
      booking_id: 1,
      category: 'invalid',
      description: 'Test',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty description', () => {
    const result = createIncidentSchema.safeParse({
      booking_id: 1,
      category: 'pet_injury',
      description: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects description over 2000 chars', () => {
    const result = createIncidentSchema.safeParse({
      booking_id: 1,
      category: 'pet_injury',
      description: 'x'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });

  it('rejects more than 4 evidence items', () => {
    const result = createIncidentSchema.safeParse({
      booking_id: 1,
      category: 'pet_injury',
      description: 'Test',
      evidence: Array.from({ length: 5 }, (_, i) => ({
        media_url: `https://s3.example.com/photo${i}.jpg`,
        media_type: 'image',
      })),
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-HTTPS media URL', () => {
    const result = createIncidentSchema.safeParse({
      booking_id: 1,
      category: 'pet_injury',
      description: 'Test',
      evidence: [{ media_url: 'http://example.com/photo.jpg', media_type: 'image' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid media_type', () => {
    const result = createIncidentSchema.safeParse({
      booking_id: 1,
      category: 'pet_injury',
      description: 'Test',
      evidence: [{ media_url: 'https://s3.example.com/doc.pdf', media_type: 'document' }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts notes up to 1000 chars', () => {
    const result = createIncidentSchema.safeParse({
      booking_id: 1,
      category: 'pet_injury',
      description: 'Test',
      notes: 'x'.repeat(1000),
    });
    expect(result.success).toBe(true);
  });

  it('rejects notes over 1000 chars', () => {
    const result = createIncidentSchema.safeParse({
      booking_id: 1,
      category: 'pet_injury',
      description: 'Test',
      notes: 'x'.repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it('defaults evidence to empty array', () => {
    const result = createIncidentSchema.safeParse({
      booking_id: 1,
      category: 'other',
      description: 'Test',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.evidence).toEqual([]);
    }
  });
});
