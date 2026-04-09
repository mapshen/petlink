import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      roles TEXT DEFAULT 'owner',
      avatar_url TEXT
    );
    CREATE TABLE forum_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      space_type TEXT DEFAULT 'everyone',
      role_gate TEXT,
      active INTEGER DEFAULT 1
    );
    CREATE TABLE live_threads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      space_id INTEGER NOT NULL REFERENCES forum_categories(id) ON DELETE CASCADE,
      creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
      participant_count INTEGER DEFAULT 0,
      last_activity_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE live_thread_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id INTEGER NOT NULL REFERENCES live_threads(id) ON DELETE CASCADE,
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      photo_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  db.prepare("INSERT INTO users (email, name, roles) VALUES ('sitter@test.com', 'Sarah M', 'owner,sitter')").run();
  db.prepare("INSERT INTO users (email, name, roles) VALUES ('owner@test.com', 'Jessica R', 'owner')").run();
  db.prepare("INSERT INTO forum_categories (name, slug, space_type, role_gate) VALUES ('Sitter Lounge', 'sitter-lounge', 'sitter_only', 'sitter')").run();
  db.prepare("INSERT INTO forum_categories (name, slug, space_type) VALUES ('General', 'general', 'everyone')").run();
  return db;
}

describe('live threads schema', () => {
  let db: ReturnType<typeof Database>;
  beforeEach(() => { db = createTestDb(); });

  it('creates a live thread', () => {
    db.prepare("INSERT INTO live_threads (space_id, creator_id, title) VALUES (1, 1, 'Friday debrief')").run();
    const thread = db.prepare('SELECT * FROM live_threads WHERE creator_id = 1').get() as Record<string, unknown>;
    expect(thread.title).toBe('Friday debrief');
    expect(thread.status).toBe('active');
    expect(thread.participant_count).toBe(0);
  });

  it('creates a message in a thread', () => {
    const { lastInsertRowid } = db.prepare("INSERT INTO live_threads (space_id, creator_id, title) VALUES (1, 1, 'Test')").run();
    db.prepare("INSERT INTO live_thread_messages (thread_id, author_id, content) VALUES (?, 1, 'Hello everyone!')").run(lastInsertRowid);
    const msg = db.prepare('SELECT * FROM live_thread_messages WHERE thread_id = ?').get(lastInsertRowid) as Record<string, unknown>;
    expect(msg.content).toBe('Hello everyone!');
  });

  it('cascades delete when thread is deleted', () => {
    const { lastInsertRowid } = db.prepare("INSERT INTO live_threads (space_id, creator_id, title) VALUES (1, 1, 'Test')").run();
    db.prepare("INSERT INTO live_thread_messages (thread_id, author_id, content) VALUES (?, 1, 'Msg 1')").run(lastInsertRowid);
    db.prepare("INSERT INTO live_thread_messages (thread_id, author_id, content) VALUES (?, 2, 'Msg 2')").run(lastInsertRowid);
    db.prepare('DELETE FROM live_threads WHERE id = ?').run(lastInsertRowid);
    const msgs = db.prepare('SELECT * FROM live_thread_messages WHERE thread_id = ?').all(lastInsertRowid);
    expect(msgs).toHaveLength(0);
  });

  it('archives a thread', () => {
    db.prepare("INSERT INTO live_threads (space_id, creator_id, title) VALUES (1, 1, 'Test')").run();
    db.prepare("UPDATE live_threads SET status = 'archived' WHERE id = 1").run();
    const thread = db.prepare('SELECT * FROM live_threads WHERE id = 1').get() as Record<string, unknown>;
    expect(thread.status).toBe('archived');
  });

  it('rejects invalid status', () => {
    expect(() => {
      db.prepare("INSERT INTO live_threads (space_id, creator_id, title, status) VALUES (1, 1, 'Test', 'invalid')").run();
    }).toThrow();
  });

  it('orders messages by created_at ASC', () => {
    const { lastInsertRowid } = db.prepare("INSERT INTO live_threads (space_id, creator_id, title) VALUES (1, 1, 'Test')").run();
    db.prepare("INSERT INTO live_thread_messages (thread_id, author_id, content, created_at) VALUES (?, 1, 'First', '2025-01-01')").run(lastInsertRowid);
    db.prepare("INSERT INTO live_thread_messages (thread_id, author_id, content, created_at) VALUES (?, 2, 'Second', '2025-01-02')").run(lastInsertRowid);
    const msgs = db.prepare('SELECT content FROM live_thread_messages WHERE thread_id = ? ORDER BY created_at ASC').all(lastInsertRowid) as Array<{ content: string }>;
    expect(msgs.map(m => m.content)).toEqual(['First', 'Second']);
  });

  it('filters active threads by space', () => {
    db.prepare("INSERT INTO live_threads (space_id, creator_id, title, status) VALUES (1, 1, 'Active', 'active')").run();
    db.prepare("INSERT INTO live_threads (space_id, creator_id, title, status) VALUES (1, 1, 'Archived', 'archived')").run();
    db.prepare("INSERT INTO live_threads (space_id, creator_id, title, status) VALUES (2, 2, 'Other space', 'active')").run();
    const threads = db.prepare("SELECT * FROM live_threads WHERE space_id = 1 AND status = 'active'").all();
    expect(threads).toHaveLength(1);
  });

  it('tracks participant count', () => {
    db.prepare("INSERT INTO live_threads (space_id, creator_id, title) VALUES (1, 1, 'Test')").run();
    db.prepare('UPDATE live_threads SET participant_count = participant_count + 1 WHERE id = 1').run();
    db.prepare('UPDATE live_threads SET participant_count = participant_count + 1 WHERE id = 1').run();
    const thread = db.prepare('SELECT participant_count FROM live_threads WHERE id = 1').get() as { participant_count: number };
    expect(thread.participant_count).toBe(2);
  });
});
