import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import {
  createDisputeSchema,
  disputeMessageSchema,
  resolveDisputeSchema,
  updateDisputeStatusSchema,
} from './validation.ts';


// ---------------------------------------------------------------------------
// Part 2: Validation schema tests (pure unit tests)
// ---------------------------------------------------------------------------
describe('createDisputeSchema', () => {
  it('accepts valid input', () => {
    const result = createDisputeSchema.safeParse({ booking_id: 1, reason: 'Service was poor' });
    expect(result.success).toBe(true);
  });

  it('accepts optional incident_id', () => {
    const result = createDisputeSchema.safeParse({ booking_id: 1, incident_id: 5, reason: 'Linked to incident' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.incident_id).toBe(5);
  });

  it('rejects missing reason', () => {
    const result = createDisputeSchema.safeParse({ booking_id: 1 });
    expect(result.success).toBe(false);
  });

  it('rejects empty reason', () => {
    const result = createDisputeSchema.safeParse({ booking_id: 1, reason: '   ' });
    expect(result.success).toBe(false);
  });

  it('rejects reason exceeding 2000 characters', () => {
    const result = createDisputeSchema.safeParse({ booking_id: 1, reason: 'x'.repeat(2001) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Reason must be under 2000 characters');
    }
  });

  it('rejects invalid booking_id (zero)', () => {
    const result = createDisputeSchema.safeParse({ booking_id: 0, reason: 'test' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid booking_id (negative)', () => {
    const result = createDisputeSchema.safeParse({ booking_id: -1, reason: 'test' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid booking_id (non-integer)', () => {
    const result = createDisputeSchema.safeParse({ booking_id: 1.5, reason: 'test' });
    expect(result.success).toBe(false);
  });
});

describe('disputeMessageSchema', () => {
  it('accepts valid message', () => {
    const result = disputeMessageSchema.safeParse({ content: 'Here is my response' });
    expect(result.success).toBe(true);
  });

  it('accepts message with evidence_urls', () => {
    const result = disputeMessageSchema.safeParse({
      content: 'See photos',
      evidence_urls: ['https://example.com/photo1.jpg', 'https://example.com/photo2.jpg'],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.evidence_urls).toHaveLength(2);
  });

  it('accepts message with is_admin_note', () => {
    const result = disputeMessageSchema.safeParse({ content: 'Internal note', is_admin_note: true });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.is_admin_note).toBe(true);
  });

  it('defaults is_admin_note to false', () => {
    const result = disputeMessageSchema.safeParse({ content: 'Hello' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.is_admin_note).toBe(false);
  });

  it('defaults evidence_urls to empty array', () => {
    const result = disputeMessageSchema.safeParse({ content: 'Hello' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.evidence_urls).toEqual([]);
  });

  it('rejects empty content', () => {
    const result = disputeMessageSchema.safeParse({ content: '' });
    expect(result.success).toBe(false);
  });

  it('rejects whitespace-only content', () => {
    const result = disputeMessageSchema.safeParse({ content: '   ' });
    expect(result.success).toBe(false);
  });

  it('rejects content exceeding 2000 characters', () => {
    const result = disputeMessageSchema.safeParse({ content: 'x'.repeat(2001) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Message must be under 2000 characters');
    }
  });

  it('allows maximum 4 evidence URLs', () => {
    const result = disputeMessageSchema.safeParse({
      content: 'Photos',
      evidence_urls: [
        'https://example.com/1.jpg',
        'https://example.com/2.jpg',
        'https://example.com/3.jpg',
        'https://example.com/4.jpg',
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects more than 4 evidence URLs', () => {
    const result = disputeMessageSchema.safeParse({
      content: 'Too many',
      evidence_urls: Array.from({ length: 5 }, (_, i) => `https://example.com/${i}.jpg`),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Maximum 4 evidence items');
    }
  });

  it('rejects non-HTTPS evidence URL', () => {
    const result = disputeMessageSchema.safeParse({
      content: 'Photo',
      evidence_urls: ['http://example.com/photo.jpg'],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('URL must use HTTPS');
    }
  });

  it('rejects invalid URL in evidence', () => {
    const result = disputeMessageSchema.safeParse({
      content: 'Photo',
      evidence_urls: ['not-a-url'],
    });
    expect(result.success).toBe(false);
  });
});

describe('resolveDisputeSchema', () => {
  const allResolutionTypes = [
    'full_refund', 'partial_refund', 'credit', 'warning_owner',
    'warning_sitter', 'ban_sitter', 'ban_owner', 'no_action',
  ] as const;

  it.each(allResolutionTypes)('accepts valid resolution type: %s', (type) => {
    const body: Record<string, unknown> = { resolution_type: type, resolution_notes: 'Decision made' };
    if (type === 'partial_refund') body.resolution_amount_cents = 1000;
    const result = resolveDisputeSchema.safeParse(body);
    expect(result.success).toBe(true);
  });

  it('rejects invalid resolution type', () => {
    const result = resolveDisputeSchema.safeParse({ resolution_type: 'slap_on_wrist', resolution_notes: 'Hmm' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Invalid resolution type');
    }
  });

  it('rejects missing resolution_notes', () => {
    const result = resolveDisputeSchema.safeParse({ resolution_type: 'no_action' });
    expect(result.success).toBe(false);
  });

  it('rejects empty resolution_notes', () => {
    const result = resolveDisputeSchema.safeParse({ resolution_type: 'no_action', resolution_notes: '  ' });
    expect(result.success).toBe(false);
  });

  it('rejects resolution_notes exceeding 2000 characters', () => {
    const result = resolveDisputeSchema.safeParse({ resolution_type: 'no_action', resolution_notes: 'x'.repeat(2001) });
    expect(result.success).toBe(false);
  });

  it('accepts partial_refund with valid amount', () => {
    const result = resolveDisputeSchema.safeParse({
      resolution_type: 'partial_refund',
      resolution_amount_cents: 2500,
      resolution_notes: 'Half refund',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.resolution_amount_cents).toBe(2500);
  });

  it('rejects partial_refund with zero amount via schema', () => {
    const result = resolveDisputeSchema.safeParse({
      resolution_type: 'partial_refund',
      resolution_amount_cents: 0,
      resolution_notes: 'Free?',
    });
    expect(result.success).toBe(false);
  });

  it('allows null resolution_amount_cents for non-refund types', () => {
    const result = resolveDisputeSchema.safeParse({
      resolution_type: 'warning_sitter',
      resolution_amount_cents: null,
      resolution_notes: 'First warning',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.resolution_amount_cents).toBeNull();
  });
});

describe('updateDisputeStatusSchema', () => {
  it.each(['under_review', 'awaiting_response', 'closed'] as const)('accepts valid status: %s', (status) => {
    const result = updateDisputeStatusSchema.safeParse({ status });
    expect(result.success).toBe(true);
  });

  it('rejects "open" as update status', () => {
    const result = updateDisputeStatusSchema.safeParse({ status: 'open' });
    expect(result.success).toBe(false);
  });

  it('rejects "resolved" as update status', () => {
    const result = updateDisputeStatusSchema.safeParse({ status: 'resolved' });
    expect(result.success).toBe(false);
  });

  it('rejects arbitrary invalid status', () => {
    const result = updateDisputeStatusSchema.safeParse({ status: 'deleted' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Status must be under_review, awaiting_response, or closed');
    }
  });
});

// ---------------------------------------------------------------------------
// Part 3: SQLite in-memory DB tests (data integrity, cascades, constraints)
// ---------------------------------------------------------------------------
describe('dispute data integrity (SQLite)', () => {
  let db: ReturnType<typeof Database>;

  beforeAll(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        roles TEXT DEFAULT 'owner',
        approval_status TEXT DEFAULT 'approved',
        approval_rejected_reason TEXT
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sitter_id) REFERENCES users(id),
        FOREIGN KEY (owner_id) REFERENCES users(id)
      );
      CREATE TABLE incident_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id INTEGER NOT NULL,
        reporter_id INTEGER NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
        FOREIGN KEY (reporter_id) REFERENCES users(id)
      );
      CREATE TABLE disputes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id INTEGER NOT NULL REFERENCES bookings(id),
        incident_id INTEGER REFERENCES incident_reports(id),
        filed_by INTEGER NOT NULL REFERENCES users(id),
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'under_review', 'awaiting_response', 'resolved', 'closed')),
        assigned_admin_id INTEGER REFERENCES users(id),
        resolution_type TEXT CHECK(resolution_type IN ('full_refund', 'partial_refund', 'credit', 'warning_owner', 'warning_sitter', 'ban_sitter', 'ban_owner', 'no_action')),
        resolution_amount_cents INTEGER,
        resolution_notes TEXT,
        resolved_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX idx_disputes_active_booking ON disputes (booking_id) WHERE status NOT IN ('resolved', 'closed');
      CREATE TABLE dispute_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dispute_id INTEGER NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
        sender_id INTEGER NOT NULL REFERENCES users(id),
        content TEXT NOT NULL,
        is_admin_note INTEGER DEFAULT 0,
        evidence_urls TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Seed: owner (1), sitter (2), admin (3)
    db.prepare("INSERT INTO users (email, password_hash, name, roles) VALUES ('owner@test.com', 'hash', 'Owner', 'owner')").run();
    db.prepare("INSERT INTO users (email, password_hash, name, roles) VALUES ('sitter@test.com', 'hash', 'Sitter', 'owner,sitter')").run();
    db.prepare("INSERT INTO users (email, password_hash, name, roles) VALUES ('admin@test.com', 'hash', 'Admin', 'owner,admin')").run();
    // Seed service + bookings
    db.prepare("INSERT INTO services (sitter_id, type, price_cents) VALUES (2, 'walking', 2500)").run();
    db.prepare("INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time, total_price_cents) VALUES (2, 1, 1, 'confirmed', '2026-04-10T10:00:00Z', '2026-04-10T11:00:00Z', 5000)").run();
    db.prepare("INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time, total_price_cents) VALUES (2, 1, 1, 'completed', '2026-04-08T10:00:00Z', '2026-04-08T11:00:00Z', 3000)").run();
    db.prepare("INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time, total_price_cents) VALUES (2, 1, 1, 'in_progress', '2026-04-11T10:00:00Z', '2026-04-11T11:00:00Z', 4000)").run();
  });

  afterAll(() => {
    db.close();
  });

  // --- disputes table: insert, query ---
  describe('disputes table', () => {
    it('inserts a dispute and queries by booking_id', () => {
      const info = db.prepare(
        "INSERT INTO disputes (booking_id, filed_by, reason) VALUES (1, 1, 'Sitter no-show')"
      ).run();
      expect(info.changes).toBe(1);

      const row = db.prepare('SELECT * FROM disputes WHERE booking_id = 1').get() as any;
      expect(row.booking_id).toBe(1);
      expect(row.filed_by).toBe(1);
      expect(row.reason).toBe('Sitter no-show');
      expect(row.status).toBe('open');
      expect(row.created_at).toBeDefined();
    });

    it('defaults status to open', () => {
      const row = db.prepare('SELECT status FROM disputes WHERE id = 1').get() as any;
      expect(row.status).toBe('open');
    });
  });

  // --- Unique partial index: only one active dispute per booking ---
  describe('unique active dispute per booking constraint', () => {
    it('rejects a second active dispute on the same booking', () => {
      // First dispute already exists from previous test (booking_id=1, status=open)
      expect(() => {
        db.prepare(
          "INSERT INTO disputes (booking_id, filed_by, reason) VALUES (1, 2, 'Another dispute')"
        ).run();
      }).toThrow();
    });

    it('allows a new dispute after resolving the existing one', () => {
      // Resolve the existing dispute
      db.prepare("UPDATE disputes SET status = 'resolved' WHERE booking_id = 1 AND status = 'open'").run();

      // Now can insert a new active dispute
      const info = db.prepare(
        "INSERT INTO disputes (booking_id, filed_by, reason) VALUES (1, 2, 'New issue after resolution')"
      ).run();
      expect(info.changes).toBe(1);
    });

    it('allows a new dispute after closing the existing one', () => {
      // Close the current active dispute
      db.prepare("UPDATE disputes SET status = 'closed' WHERE booking_id = 1 AND status NOT IN ('resolved', 'closed')").run();

      // Now can insert another active dispute
      const info = db.prepare(
        "INSERT INTO disputes (booking_id, filed_by, reason) VALUES (1, 1, 'Third dispute')"
      ).run();
      expect(info.changes).toBe(1);
    });
  });

  // --- Multiple resolved/closed disputes allowed per booking ---
  describe('multiple resolved/closed disputes per booking', () => {
    it('allows multiple resolved disputes on the same booking', () => {
      // Close current active dispute on booking 1
      db.prepare("UPDATE disputes SET status = 'resolved' WHERE booking_id = 1 AND status NOT IN ('resolved', 'closed')").run();

      // Count resolved/closed for booking 1
      const { cnt } = db.prepare(
        "SELECT COUNT(*) as cnt FROM disputes WHERE booking_id = 1 AND status IN ('resolved', 'closed')"
      ).get() as any;
      expect(cnt).toBeGreaterThanOrEqual(2);
    });

    it('allows inserting another dispute on booking 2 independently', () => {
      const info = db.prepare(
        "INSERT INTO disputes (booking_id, filed_by, reason) VALUES (2, 1, 'Issue on booking 2')"
      ).run();
      expect(info.changes).toBe(1);
    });
  });

  // --- dispute_messages table: insert, CASCADE ---
  describe('dispute_messages table', () => {
    let testDisputeId: number;

    beforeAll(() => {
      // Create a fresh dispute on booking 3 for message tests
      const info = db.prepare(
        "INSERT INTO disputes (booking_id, filed_by, reason) VALUES (3, 1, 'For message tests')"
      ).run();
      testDisputeId = Number(info.lastInsertRowid);
    });

    it('inserts a message linked to a dispute', () => {
      const info = db.prepare(
        'INSERT INTO dispute_messages (dispute_id, sender_id, content) VALUES (?, 1, ?)'
      ).run(testDisputeId, 'I have a concern');
      expect(info.changes).toBe(1);

      const row = db.prepare('SELECT * FROM dispute_messages WHERE id = ?').get(info.lastInsertRowid) as any;
      expect(row.dispute_id).toBe(testDisputeId);
      expect(row.sender_id).toBe(1);
      expect(row.content).toBe('I have a concern');
      expect(row.is_admin_note).toBe(0); // SQLite boolean
    });

    it('supports is_admin_note flag', () => {
      const info = db.prepare(
        'INSERT INTO dispute_messages (dispute_id, sender_id, content, is_admin_note) VALUES (?, 3, ?, 1)'
      ).run(testDisputeId, 'Admin internal note');
      const row = db.prepare('SELECT is_admin_note FROM dispute_messages WHERE id = ?').get(info.lastInsertRowid) as any;
      expect(row.is_admin_note).toBe(1); // truthy in SQLite
    });

    it('supports evidence_urls field', () => {
      const urls = JSON.stringify(['https://example.com/photo1.jpg', 'https://example.com/photo2.jpg']);
      const info = db.prepare(
        'INSERT INTO dispute_messages (dispute_id, sender_id, content, evidence_urls) VALUES (?, 1, ?, ?)'
      ).run(testDisputeId, 'See evidence', urls);
      const row = db.prepare('SELECT evidence_urls FROM dispute_messages WHERE id = ?').get(info.lastInsertRowid) as any;
      const parsed = JSON.parse(row.evidence_urls);
      expect(parsed).toHaveLength(2);
      expect(parsed[0]).toBe('https://example.com/photo1.jpg');
    });

    it('CASCADE deletes messages when dispute is deleted', () => {
      // Create a disposable dispute + messages
      const disputeInfo = db.prepare(
        "INSERT INTO disputes (booking_id, filed_by, reason, status) VALUES (3, 2, 'Cascade test', 'resolved')"
      ).run();
      const dId = disputeInfo.lastInsertRowid;

      db.prepare('INSERT INTO dispute_messages (dispute_id, sender_id, content) VALUES (?, 1, ?)').run(dId, 'Msg 1');
      db.prepare('INSERT INTO dispute_messages (dispute_id, sender_id, content) VALUES (?, 2, ?)').run(dId, 'Msg 2');

      expect((db.prepare('SELECT COUNT(*) as cnt FROM dispute_messages WHERE dispute_id = ?').get(dId) as any).cnt).toBe(2);

      db.prepare('DELETE FROM disputes WHERE id = ?').run(dId);

      expect((db.prepare('SELECT COUNT(*) as cnt FROM dispute_messages WHERE dispute_id = ?').get(dId) as any).cnt).toBe(0);
    });
  });

  // --- Status CHECK constraint ---
  describe('status CHECK constraint', () => {
    it.each(['open', 'under_review', 'awaiting_response', 'resolved', 'closed'])('accepts valid status: %s', (status) => {
      // Ensure no active dispute blocks the insert
      db.prepare("UPDATE disputes SET status = 'resolved' WHERE booking_id = 2 AND status NOT IN ('resolved', 'closed')").run();
      const info = db.prepare(
        'INSERT INTO disputes (booking_id, filed_by, reason, status) VALUES (2, 1, ?, ?)'
      ).run(`Test ${status}`, status);
      expect(info.changes).toBe(1);
      // Clean up: resolve it so the unique index does not block subsequent inserts
      if (!['resolved', 'closed'].includes(status)) {
        db.prepare("UPDATE disputes SET status = 'resolved' WHERE id = ?").run(info.lastInsertRowid);
      }
    });

    it('rejects invalid status', () => {
      expect(() => {
        db.prepare(
          "INSERT INTO disputes (booking_id, filed_by, reason, status) VALUES (2, 1, 'Bad status', 'deleted')"
        ).run();
      }).toThrow();
    });
  });

  // --- Resolution type CHECK constraint ---
  describe('resolution_type CHECK constraint', () => {
    const validTypes = ['full_refund', 'partial_refund', 'credit', 'warning_owner', 'warning_sitter', 'ban_sitter', 'ban_owner', 'no_action'];

    it.each(validTypes)('accepts valid resolution type: %s', (type) => {
      // Resolve existing active on booking 2 if any
      db.prepare("UPDATE disputes SET status = 'resolved' WHERE booking_id = 2 AND status NOT IN ('resolved', 'closed')").run();
      const info = db.prepare(
        'INSERT INTO disputes (booking_id, filed_by, reason, status, resolution_type) VALUES (2, 1, ?, ?, ?)'
      ).run(`Res ${type}`, 'resolved', type);
      expect(info.changes).toBe(1);
    });

    it('rejects invalid resolution type', () => {
      expect(() => {
        db.prepare(
          "INSERT INTO disputes (booking_id, filed_by, reason, status, resolution_type) VALUES (2, 1, 'Bad type', 'resolved', 'slap_on_wrist')"
        ).run();
      }).toThrow();
    });

    it('allows null resolution_type', () => {
      db.prepare("UPDATE disputes SET status = 'resolved' WHERE booking_id = 2 AND status NOT IN ('resolved', 'closed')").run();
      const info = db.prepare(
        "INSERT INTO disputes (booking_id, filed_by, reason, status, resolution_type) VALUES (2, 1, 'No resolution yet', 'closed', NULL)"
      ).run();
      expect(info.changes).toBe(1);
      const row = db.prepare('SELECT resolution_type FROM disputes WHERE id = ?').get(info.lastInsertRowid) as any;
      expect(row.resolution_type).toBeNull();
    });
  });
});
