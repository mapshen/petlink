import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { createDisputeSchema, disputeMessageSchema, resolveDisputeSchema, updateDisputeStatusSchema } from './validation';

describe('dispute mediation', () => {
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
        approval_status TEXT DEFAULT 'approved'
      );
      CREATE TABLE bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sitter_id INTEGER NOT NULL,
        owner_id INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        total_price_cents INTEGER,
        payment_intent_id TEXT,
        payment_status TEXT DEFAULT 'pending',
        FOREIGN KEY (sitter_id) REFERENCES users(id),
        FOREIGN KEY (owner_id) REFERENCES users(id)
      );
      CREATE TABLE incident_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id INTEGER NOT NULL,
        reporter_id INTEGER NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
      );
      CREATE TABLE disputes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id INTEGER NOT NULL,
        incident_id INTEGER REFERENCES incident_reports(id),
        filed_by INTEGER NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'under_review', 'awaiting_response', 'resolved', 'closed')),
        assigned_admin_id INTEGER,
        resolution_type TEXT CHECK(resolution_type IN ('full_refund', 'partial_refund', 'credit', 'warning_owner', 'warning_sitter', 'ban_sitter', 'ban_owner', 'no_action')),
        resolution_amount_cents INTEGER,
        resolution_notes TEXT,
        resolved_at TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (booking_id) REFERENCES bookings(id),
        FOREIGN KEY (filed_by) REFERENCES users(id)
      );
      CREATE TABLE dispute_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dispute_id INTEGER NOT NULL,
        sender_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        is_admin_note INTEGER DEFAULT 0,
        evidence_urls TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (dispute_id) REFERENCES disputes(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES users(id)
      );
    `);

    testDb.prepare("INSERT INTO users (email, password_hash, name, roles) VALUES ('owner@test.com', 'hash', 'Owner', 'owner')").run(); // id=1
    testDb.prepare("INSERT INTO users (email, password_hash, name, roles) VALUES ('sitter@test.com', 'hash', 'Sitter', 'owner,sitter')").run(); // id=2
    testDb.prepare("INSERT INTO users (email, password_hash, name, roles) VALUES ('admin@test.com', 'hash', 'Admin', 'owner,admin')").run(); // id=3
    testDb.prepare("INSERT INTO bookings (sitter_id, owner_id, status, start_time, end_time, total_price_cents) VALUES (2, 1, 'completed', '2026-04-01', '2026-04-03', 13500)").run(); // id=1
    testDb.prepare("INSERT INTO bookings (sitter_id, owner_id, status, start_time, end_time) VALUES (2, 1, 'confirmed', '2026-04-10', '2026-04-11')").run(); // id=2
    testDb.prepare("INSERT INTO incident_reports (booking_id, reporter_id, category, description) VALUES (1, 1, 'pet_injury', 'Cat scratch')").run(); // id=1
  });

  afterAll(() => { testDb.close(); });

  // --- Dispute CRUD ---

  it('creates a dispute', () => {
    const info = testDb.prepare(
      "INSERT INTO disputes (booking_id, incident_id, filed_by, reason) VALUES (1, 1, 1, 'Cat was hurt during stay')"
    ).run();
    expect(info.changes).toBe(1);
    const dispute = testDb.prepare('SELECT * FROM disputes WHERE id = 1').get() as any;
    expect(dispute.status).toBe('open');
    expect(dispute.booking_id).toBe(1);
    expect(dispute.incident_id).toBe(1);
  });

  it('creates a dispute without incident link', () => {
    const info = testDb.prepare(
      "INSERT INTO disputes (booking_id, filed_by, reason, status) VALUES (2, 1, 'Service quality issue', 'open')"
    ).run();
    expect(info.changes).toBe(1);
    const dispute = testDb.prepare('SELECT * FROM disputes WHERE id = 2').get() as any;
    expect(dispute.incident_id).toBeNull();
  });

  it('rejects invalid status', () => {
    expect(() => {
      testDb.prepare("INSERT INTO disputes (booking_id, filed_by, reason, status) VALUES (1, 1, 'test', 'invalid')").run();
    }).toThrow();
  });

  it('all 5 statuses are valid', () => {
    for (const status of ['open', 'under_review', 'awaiting_response', 'resolved', 'closed']) {
      const info = testDb.prepare("INSERT INTO disputes (booking_id, filed_by, reason, status) VALUES (1, 2, ?, ?)").run('test ' + status, status);
      expect(info.changes).toBe(1);
    }
  });

  it('all 8 resolution types are valid', () => {
    for (const type of ['full_refund', 'partial_refund', 'credit', 'warning_owner', 'warning_sitter', 'ban_sitter', 'ban_owner', 'no_action']) {
      const info = testDb.prepare("UPDATE disputes SET resolution_type = ? WHERE id = 1").run(type);
      expect(info.changes).toBe(1);
    }
    // Reset
    testDb.prepare("UPDATE disputes SET resolution_type = NULL WHERE id = 1").run();
  });

  it('rejects invalid resolution type', () => {
    expect(() => {
      testDb.prepare("UPDATE disputes SET resolution_type = 'invalid' WHERE id = 1").run();
    }).toThrow();
  });

  // --- Dispute Messages ---

  it('creates a message on a dispute', () => {
    testDb.prepare("INSERT INTO dispute_messages (dispute_id, sender_id, content) VALUES (1, 1, 'Please investigate')").run();
    testDb.prepare("INSERT INTO dispute_messages (dispute_id, sender_id, content, is_admin_note) VALUES (1, 3, 'Reviewing evidence', 1)").run();

    const messages = testDb.prepare('SELECT * FROM dispute_messages WHERE dispute_id = 1 ORDER BY created_at').all() as any[];
    expect(messages).toHaveLength(2);
    expect(messages[0].is_admin_note).toBe(0);
    expect(messages[1].is_admin_note).toBe(1);
  });

  it('deleting dispute cascades to messages', () => {
    // Create a dispute with messages for cascade test
    testDb.prepare("INSERT INTO disputes (booking_id, filed_by, reason, status) VALUES (1, 1, 'cascade test', 'closed')").run();
    const disputeId = (testDb.prepare('SELECT last_insert_rowid() as id').get() as any).id;
    testDb.prepare("INSERT INTO dispute_messages (dispute_id, sender_id, content) VALUES (?, 1, 'will be deleted')").run(disputeId);

    testDb.prepare('DELETE FROM disputes WHERE id = ?').run(disputeId);
    const messages = testDb.prepare('SELECT * FROM dispute_messages WHERE dispute_id = ?').all(disputeId);
    expect(messages).toHaveLength(0);
  });

  // --- Resolution ---

  it('resolves a dispute with full refund', () => {
    testDb.prepare(`
      UPDATE disputes SET status = 'resolved', resolution_type = 'full_refund',
        resolution_notes = 'Full refund due to injury', resolved_at = datetime('now')
      WHERE id = 1
    `).run();
    const dispute = testDb.prepare('SELECT * FROM disputes WHERE id = 1').get() as any;
    expect(dispute.status).toBe('resolved');
    expect(dispute.resolution_type).toBe('full_refund');
    expect(dispute.resolved_at).not.toBeNull();
  });

  it('resolves a dispute with partial refund amount', () => {
    testDb.prepare("UPDATE disputes SET status = 'under_review' WHERE id = 2").run();
    testDb.prepare(`
      UPDATE disputes SET status = 'resolved', resolution_type = 'partial_refund',
        resolution_amount_cents = 4500, resolution_notes = 'One night refund'
      WHERE id = 2
    `).run();
    const dispute = testDb.prepare('SELECT * FROM disputes WHERE id = 2').get() as any;
    expect(dispute.resolution_amount_cents).toBe(4500);
  });

  it('ban resolution can update user approval_status', () => {
    testDb.prepare("UPDATE users SET approval_status = 'banned' WHERE id = 2").run();
    const user = testDb.prepare('SELECT approval_status FROM users WHERE id = 2').get() as any;
    expect(user.approval_status).toBe('banned');
    // Reset
    testDb.prepare("UPDATE users SET approval_status = 'approved' WHERE id = 2").run();
  });
});

describe('dispute validation schemas', () => {
  // createDisputeSchema
  it('accepts valid dispute', () => {
    expect(createDisputeSchema.safeParse({ booking_id: 1, reason: 'Issue with service' }).success).toBe(true);
  });

  it('accepts dispute with incident_id', () => {
    expect(createDisputeSchema.safeParse({ booking_id: 1, incident_id: 5, reason: 'Linked to incident' }).success).toBe(true);
  });

  it('rejects missing reason', () => {
    expect(createDisputeSchema.safeParse({ booking_id: 1 }).success).toBe(false);
  });

  it('rejects empty reason', () => {
    expect(createDisputeSchema.safeParse({ booking_id: 1, reason: '' }).success).toBe(false);
  });

  it('rejects reason over 2000 chars', () => {
    expect(createDisputeSchema.safeParse({ booking_id: 1, reason: 'x'.repeat(2001) }).success).toBe(false);
  });

  // disputeMessageSchema
  it('accepts valid message', () => {
    expect(disputeMessageSchema.safeParse({ content: 'Hello' }).success).toBe(true);
  });

  it('accepts message with evidence', () => {
    const result = disputeMessageSchema.safeParse({
      content: 'See attached',
      evidence_urls: ['https://s3.example.com/photo.jpg'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty content', () => {
    expect(disputeMessageSchema.safeParse({ content: '' }).success).toBe(false);
  });

  it('rejects more than 4 evidence URLs', () => {
    const result = disputeMessageSchema.safeParse({
      content: 'Test',
      evidence_urls: Array.from({ length: 5 }, (_, i) => `https://s3.example.com/img${i}.jpg`),
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-HTTPS evidence URL', () => {
    expect(disputeMessageSchema.safeParse({ content: 'Test', evidence_urls: ['http://example.com/img.jpg'] }).success).toBe(false);
  });

  // resolveDisputeSchema
  it('accepts all 8 resolution types', () => {
    for (const type of ['full_refund', 'partial_refund', 'credit', 'warning_owner', 'warning_sitter', 'ban_sitter', 'ban_owner', 'no_action']) {
      const result = resolveDisputeSchema.safeParse({
        resolution_type: type,
        resolution_notes: 'Resolution reason',
        ...(type === 'partial_refund' ? { resolution_amount_cents: 5000 } : {}),
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid resolution type', () => {
    expect(resolveDisputeSchema.safeParse({ resolution_type: 'invalid', resolution_notes: 'test' }).success).toBe(false);
  });

  it('rejects missing resolution notes', () => {
    expect(resolveDisputeSchema.safeParse({ resolution_type: 'no_action' }).success).toBe(false);
  });

  it('rejects partial_refund with negative amount', () => {
    expect(resolveDisputeSchema.safeParse({ resolution_type: 'partial_refund', resolution_notes: 'test', resolution_amount_cents: -100 }).success).toBe(false);
  });

  // updateDisputeStatusSchema
  it('accepts valid status transitions', () => {
    for (const status of ['under_review', 'awaiting_response', 'closed']) {
      expect(updateDisputeStatusSchema.safeParse({ status }).success).toBe(true);
    }
  });

  it('rejects resolved as a direct status (must use resolve endpoint)', () => {
    expect(updateDisputeStatusSchema.safeParse({ status: 'resolved' }).success).toBe(false);
  });

  it('rejects open as a status update', () => {
    expect(updateDisputeStatusSchema.safeParse({ status: 'open' }).success).toBe(false);
  });

  it('rejects invalid status', () => {
    expect(updateDisputeStatusSchema.safeParse({ status: 'invalid' }).success).toBe(false);
  });
});
