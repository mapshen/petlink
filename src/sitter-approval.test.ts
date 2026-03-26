import { describe, it, expect, beforeEach } from 'vitest';
import { approvalActionSchema } from './validation.ts';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

// --- Validation Tests ---
describe('approvalActionSchema', () => {
  it('accepts approve action', () => {
    const result = approvalActionSchema.safeParse({ action: 'approve' });
    expect(result.success).toBe(true);
  });

  it('accepts reject action with reason', () => {
    const result = approvalActionSchema.safeParse({ action: 'reject', reason: 'Profile incomplete' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reason).toBe('Profile incomplete');
    }
  });

  it('accepts reject action without reason', () => {
    const result = approvalActionSchema.safeParse({ action: 'reject' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid action', () => {
    expect(approvalActionSchema.safeParse({ action: 'suspend' }).success).toBe(false);
  });

  it('rejects missing action', () => {
    expect(approvalActionSchema.safeParse({}).success).toBe(false);
  });

  it('rejects reason over 1000 characters', () => {
    const result = approvalActionSchema.safeParse({ action: 'reject', reason: 'x'.repeat(1001) });
    expect(result.success).toBe(false);
  });

  it('accepts reason of exactly 1000 characters', () => {
    const result = approvalActionSchema.safeParse({ action: 'reject', reason: 'x'.repeat(1000) });
    expect(result.success).toBe(true);
  });
});

// --- DB Integration Tests ---
describe('users approval_status column', () => {
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
        bio TEXT,
        avatar_url TEXT,
        approval_status TEXT DEFAULT 'approved',
        approval_rejected_reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sitter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        price REAL NOT NULL,
        description TEXT
      );
    `);
    const hash = bcrypt.hashSync('pass', 10);
    // Seed: an owner, an approved sitter, a pending sitter
    db.prepare("INSERT INTO users (email, password_hash, name, role, approval_status) VALUES (?, ?, ?, ?, ?)").run('owner@test.com', hash, 'Owner', 'owner', 'approved');
    db.prepare("INSERT INTO users (email, password_hash, name, role, approval_status) VALUES (?, ?, ?, ?, ?)").run('approved@test.com', hash, 'Approved Sitter', 'sitter', 'approved');
    db.prepare("INSERT INTO users (email, password_hash, name, role, approval_status) VALUES (?, ?, ?, ?, ?)").run('pending@test.com', hash, 'Pending Sitter', 'sitter', 'pending_approval');
    db.prepare("INSERT INTO users (email, password_hash, name, role, approval_status) VALUES (?, ?, ?, ?, ?)").run('rejected@test.com', hash, 'Rejected Sitter', 'sitter', 'rejected');

    // Add services for sitters
    db.prepare("INSERT INTO services (sitter_id, type, price) VALUES (?, ?, ?)").run(2, 'walking', 25);
    db.prepare("INSERT INTO services (sitter_id, type, price) VALUES (?, ?, ?)").run(3, 'walking', 20);
    return db;
  }

  let db: ReturnType<typeof createTestDb>;
  beforeEach(() => { db = createTestDb(); });

  it('defaults approval_status to approved (grandfathers existing sitters)', () => {
    const hash = bcrypt.hashSync('pass', 10);
    db.prepare("INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)").run('new@test.com', hash, 'New', 'sitter');
    const user = db.prepare("SELECT approval_status FROM users WHERE email = ?").get('new@test.com') as Record<string, unknown>;
    expect(user.approval_status).toBe('approved');
  });

  it('sitter search only returns approved sitters', () => {
    const sitters = db.prepare(`
      SELECT u.id, u.name, u.approval_status
      FROM users u
      JOIN services s ON u.id = s.sitter_id
      WHERE u.role IN ('sitter', 'both')
        AND u.approval_status = 'approved'
    `).all() as Record<string, unknown>[];
    expect(sitters).toHaveLength(1);
    expect(sitters[0].name).toBe('Approved Sitter');
  });

  it('pending sitters are excluded from search', () => {
    const sitters = db.prepare(`
      SELECT u.id, u.name
      FROM users u
      JOIN services s ON u.id = s.sitter_id
      WHERE u.role IN ('sitter', 'both')
        AND u.approval_status = 'approved'
    `).all() as Record<string, unknown>[];
    const names = sitters.map((s) => s.name);
    expect(names).not.toContain('Pending Sitter');
  });

  it('admin can list pending sitters', () => {
    const pending = db.prepare(`
      SELECT id, email, name, approval_status
      FROM users
      WHERE role IN ('sitter', 'both') AND approval_status = 'pending_approval'
    `).all() as Record<string, unknown>[];
    expect(pending).toHaveLength(1);
    expect(pending[0].email).toBe('pending@test.com');
  });

  it('admin can approve a pending sitter', () => {
    db.prepare("UPDATE users SET approval_status = 'approved' WHERE id = ?").run(3);
    const user = db.prepare("SELECT approval_status FROM users WHERE id = ?").get(3) as Record<string, unknown>;
    expect(user.approval_status).toBe('approved');
  });

  it('admin can reject a pending sitter with reason', () => {
    db.prepare("UPDATE users SET approval_status = 'rejected', approval_rejected_reason = ? WHERE id = ?").run('Profile incomplete', 3);
    const user = db.prepare("SELECT approval_status, approval_rejected_reason FROM users WHERE id = ?").get(3) as Record<string, unknown>;
    expect(user.approval_status).toBe('rejected');
    expect(user.approval_rejected_reason).toBe('Profile incomplete');
  });

  it('sitter profile lookup requires approved status', () => {
    const approved = db.prepare("SELECT id, name FROM users WHERE id = ? AND role IN ('sitter', 'both') AND approval_status = 'approved'").get(2) as Record<string, unknown> | undefined;
    expect(approved).toBeDefined();
    expect(approved!.name).toBe('Approved Sitter');

    const pending = db.prepare("SELECT id, name FROM users WHERE id = ? AND role IN ('sitter', 'both') AND approval_status = 'approved'").get(3) as Record<string, unknown> | undefined;
    expect(pending).toBeUndefined();
  });

  it('switching role to sitter sets pending_approval', () => {
    // Simulate: owner switches to sitter
    db.prepare("UPDATE users SET role = 'sitter', approval_status = 'pending_approval' WHERE id = ?").run(1);
    const user = db.prepare("SELECT role, approval_status FROM users WHERE id = ?").get(1) as Record<string, unknown>;
    expect(user.role).toBe('sitter');
    expect(user.approval_status).toBe('pending_approval');
  });

  it('admin can filter sitters by status', () => {
    const rejected = db.prepare(`
      SELECT id, name, approval_status
      FROM users
      WHERE role IN ('sitter', 'both') AND approval_status = 'rejected'
    `).all() as Record<string, unknown>[];
    expect(rejected).toHaveLength(1);
    expect(rejected[0].name).toBe('Rejected Sitter');
  });

  it('re-approving a rejected sitter clears the reason', () => {
    db.prepare("UPDATE users SET approval_status = 'rejected', approval_rejected_reason = 'Bad profile' WHERE id = ?").run(2);
    db.prepare("UPDATE users SET approval_status = 'approved', approval_rejected_reason = NULL WHERE id = ?").run(2);
    const user = db.prepare("SELECT approval_status, approval_rejected_reason FROM users WHERE id = ?").get(2) as Record<string, unknown>;
    expect(user.approval_status).toBe('approved');
    expect(user.approval_rejected_reason).toBeNull();
  });

  it('already-approved sitter stays approved when updating profile without role change', () => {
    // Update name without changing role — approval_status should remain
    db.prepare("UPDATE users SET name = 'Updated Name' WHERE id = ?").run(2);
    const user = db.prepare("SELECT approval_status FROM users WHERE id = ?").get(2) as Record<string, unknown>;
    expect(user.approval_status).toBe('approved');
  });
});
