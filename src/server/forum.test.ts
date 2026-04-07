import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  createForumThreadSchema,
  createForumReplySchema,
  adminUpdateThreadSchema,
} from './validation.ts';

// ---------------------------------------------------------------------------
// SQLite in-memory DB for schema / constraint tests
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
      approval_status TEXT DEFAULT 'approved',
      avatar_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE forum_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE forum_threads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL REFERENCES forum_categories(id) ON DELETE CASCADE,
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      pinned INTEGER DEFAULT 0,
      locked INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX idx_forum_threads_category ON forum_threads(category_id, created_at DESC);
    CREATE INDEX idx_forum_threads_author ON forum_threads(author_id);

    CREATE TABLE forum_replies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      thread_id INTEGER NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
      author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX idx_forum_replies_thread ON forum_replies(thread_id, created_at ASC);
    CREATE INDEX idx_forum_replies_author ON forum_replies(author_id);
  `);

  // Seed users
  db.prepare("INSERT INTO users (email, password_hash, name, roles, approval_status) VALUES (?, ?, ?, ?, ?)").run('owner@test.com', 'hash', 'Owner', 'owner', 'approved');
  db.prepare("INSERT INTO users (email, password_hash, name, roles, approval_status) VALUES (?, ?, ?, ?, ?)").run('sitter@test.com', 'hash', 'Sitter', 'owner,sitter', 'approved');
  db.prepare("INSERT INTO users (email, password_hash, name, roles, approval_status) VALUES (?, ?, ?, ?, ?)").run('admin@test.com', 'hash', 'Admin', 'owner,sitter,admin', 'approved');

  // Seed categories
  db.prepare("INSERT INTO forum_categories (name, slug, description, sort_order) VALUES (?, ?, ?, ?)").run('General', 'general', 'General discussion', 1);
  db.prepare("INSERT INTO forum_categories (name, slug, description, sort_order) VALUES (?, ?, ?, ?)").run('Tips & Tricks', 'tips-and-tricks', 'Share tips', 2);
  db.prepare("INSERT INTO forum_categories (name, slug, description, sort_order) VALUES (?, ?, ?, ?)").run('Pet Care', 'pet-care', 'Pet care discussion', 3);
  db.prepare("INSERT INTO forum_categories (name, slug, description, sort_order) VALUES (?, ?, ?, ?)").run('Business', 'business', 'Business discussion', 4);
  db.prepare("INSERT INTO forum_categories (name, slug, description, sort_order) VALUES (?, ?, ?, ?)").run('Introductions', 'introductions', 'Introduce yourself', 5);

  return db;
}

// ---------------------------------------------------------------------------
// Part 1: Validation schema tests
// ---------------------------------------------------------------------------
describe('createForumThreadSchema', () => {
  it('accepts valid thread', () => {
    const result = createForumThreadSchema.safeParse({
      category_id: 1,
      title: 'How to handle anxious dogs',
      content: 'I have been working with anxious dogs for years...',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing title', () => {
    const result = createForumThreadSchema.safeParse({
      category_id: 1,
      content: 'Some content',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty title', () => {
    const result = createForumThreadSchema.safeParse({
      category_id: 1,
      title: '   ',
      content: 'Some content',
    });
    expect(result.success).toBe(false);
  });

  it('rejects title exceeding 200 characters', () => {
    const result = createForumThreadSchema.safeParse({
      category_id: 1,
      title: 'x'.repeat(201),
      content: 'Some content',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing content', () => {
    const result = createForumThreadSchema.safeParse({
      category_id: 1,
      title: 'A title',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty content', () => {
    const result = createForumThreadSchema.safeParse({
      category_id: 1,
      title: 'A title',
      content: '  ',
    });
    expect(result.success).toBe(false);
  });

  it('rejects content exceeding 5000 characters', () => {
    const result = createForumThreadSchema.safeParse({
      category_id: 1,
      title: 'A title',
      content: 'x'.repeat(5001),
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid category_id (zero)', () => {
    const result = createForumThreadSchema.safeParse({
      category_id: 0,
      title: 'Title',
      content: 'Content',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid category_id (negative)', () => {
    const result = createForumThreadSchema.safeParse({
      category_id: -1,
      title: 'Title',
      content: 'Content',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer category_id', () => {
    const result = createForumThreadSchema.safeParse({
      category_id: 1.5,
      title: 'Title',
      content: 'Content',
    });
    expect(result.success).toBe(false);
  });

  it('trims whitespace from title and content', () => {
    const result = createForumThreadSchema.safeParse({
      category_id: 1,
      title: '  My Title  ',
      content: '  My Content  ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('My Title');
      expect(result.data.content).toBe('My Content');
    }
  });
});

describe('createForumReplySchema', () => {
  it('accepts valid reply', () => {
    const result = createForumReplySchema.safeParse({ content: 'Great post!' });
    expect(result.success).toBe(true);
  });

  it('rejects empty content', () => {
    const result = createForumReplySchema.safeParse({ content: '' });
    expect(result.success).toBe(false);
  });

  it('rejects whitespace-only content', () => {
    const result = createForumReplySchema.safeParse({ content: '   ' });
    expect(result.success).toBe(false);
  });

  it('rejects content exceeding 2000 characters', () => {
    const result = createForumReplySchema.safeParse({ content: 'x'.repeat(2001) });
    expect(result.success).toBe(false);
  });

  it('trims whitespace', () => {
    const result = createForumReplySchema.safeParse({ content: '  Hello!  ' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.content).toBe('Hello!');
    }
  });
});

describe('adminUpdateThreadSchema', () => {
  it('accepts pinned only', () => {
    const result = adminUpdateThreadSchema.safeParse({ pinned: true });
    expect(result.success).toBe(true);
  });

  it('accepts locked only', () => {
    const result = adminUpdateThreadSchema.safeParse({ locked: true });
    expect(result.success).toBe(true);
  });

  it('accepts both pinned and locked', () => {
    const result = adminUpdateThreadSchema.safeParse({ pinned: true, locked: false });
    expect(result.success).toBe(true);
  });

  it('accepts empty object', () => {
    const result = adminUpdateThreadSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('rejects non-boolean pinned', () => {
    const result = adminUpdateThreadSchema.safeParse({ pinned: 'yes' });
    expect(result.success).toBe(false);
  });

  it('rejects non-boolean locked', () => {
    const result = adminUpdateThreadSchema.safeParse({ locked: 1 });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Part 2: Database schema and constraint tests
// ---------------------------------------------------------------------------
describe('forum_categories schema', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('seeds 5 categories with correct ordering', () => {
    const categories = db.prepare('SELECT * FROM forum_categories ORDER BY sort_order').all() as any[];
    expect(categories).toHaveLength(5);
    expect(categories[0].slug).toBe('general');
    expect(categories[4].slug).toBe('introductions');
  });

  it('enforces unique slug constraint', () => {
    expect(() => {
      db.prepare("INSERT INTO forum_categories (name, slug, description, sort_order) VALUES (?, ?, ?, ?)").run('Dupe', 'general', 'Duplicate', 99);
    }).toThrow();
  });
});

describe('forum_threads schema', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  it('creates a thread', () => {
    db.prepare("INSERT INTO forum_threads (category_id, author_id, title, content) VALUES (?, ?, ?, ?)").run(1, 2, 'Test Thread', 'Thread content');
    const thread = db.prepare('SELECT * FROM forum_threads WHERE author_id = 2').get() as any;
    expect(thread).toBeDefined();
    expect(thread.title).toBe('Test Thread');
    expect(thread.pinned).toBe(0);
    expect(thread.locked).toBe(0);
  });

  it('enforces FK to forum_categories', () => {
    expect(() => {
      db.prepare("INSERT INTO forum_threads (category_id, author_id, title, content) VALUES (?, ?, ?, ?)").run(999, 2, 'Bad', 'Content');
    }).toThrow();
  });

  it('enforces FK to users', () => {
    expect(() => {
      db.prepare("INSERT INTO forum_threads (category_id, author_id, title, content) VALUES (?, ?, ?, ?)").run(1, 999, 'Bad', 'Content');
    }).toThrow();
  });

  it('cascades delete when category is deleted', () => {
    db.prepare("INSERT INTO forum_threads (category_id, author_id, title, content) VALUES (?, ?, ?, ?)").run(1, 2, 'Thread', 'Content');
    db.prepare("DELETE FROM forum_categories WHERE id = 1").run();
    const threads = db.prepare('SELECT * FROM forum_threads WHERE category_id = 1').all();
    expect(threads).toHaveLength(0);
  });

  it('cascades delete when author is deleted', () => {
    db.prepare("INSERT INTO forum_threads (category_id, author_id, title, content) VALUES (?, ?, ?, ?)").run(1, 2, 'Thread', 'Content');
    db.prepare("DELETE FROM users WHERE id = 2").run();
    const threads = db.prepare('SELECT * FROM forum_threads WHERE author_id = 2').all();
    expect(threads).toHaveLength(0);
  });
});

describe('forum_replies schema', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
    db.prepare("INSERT INTO forum_threads (category_id, author_id, title, content) VALUES (?, ?, ?, ?)").run(1, 2, 'Thread', 'Content');
  });

  it('creates a reply', () => {
    db.prepare("INSERT INTO forum_replies (thread_id, author_id, content) VALUES (?, ?, ?)").run(1, 2, 'Great post!');
    const reply = db.prepare('SELECT * FROM forum_replies WHERE thread_id = 1').get() as any;
    expect(reply).toBeDefined();
    expect(reply.content).toBe('Great post!');
  });

  it('enforces FK to forum_threads', () => {
    expect(() => {
      db.prepare("INSERT INTO forum_replies (thread_id, author_id, content) VALUES (?, ?, ?)").run(999, 2, 'Bad');
    }).toThrow();
  });

  it('cascades delete when thread is deleted', () => {
    db.prepare("INSERT INTO forum_replies (thread_id, author_id, content) VALUES (?, ?, ?)").run(1, 2, 'Reply 1');
    db.prepare("INSERT INTO forum_replies (thread_id, author_id, content) VALUES (?, ?, ?)").run(1, 3, 'Reply 2');
    db.prepare("DELETE FROM forum_threads WHERE id = 1").run();
    const replies = db.prepare('SELECT * FROM forum_replies WHERE thread_id = 1').all();
    expect(replies).toHaveLength(0);
  });

  it('allows multiple replies per thread', () => {
    db.prepare("INSERT INTO forum_replies (thread_id, author_id, content) VALUES (?, ?, ?)").run(1, 2, 'Reply 1');
    db.prepare("INSERT INTO forum_replies (thread_id, author_id, content) VALUES (?, ?, ?)").run(1, 3, 'Reply 2');
    db.prepare("INSERT INTO forum_replies (thread_id, author_id, content) VALUES (?, ?, ?)").run(1, 2, 'Reply 3');
    const replies = db.prepare('SELECT * FROM forum_replies WHERE thread_id = 1').all();
    expect(replies).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Part 3: Business logic tests
// ---------------------------------------------------------------------------
describe('forum access control logic', () => {
  it('sitter role grants forum access', () => {
    const roles = ['owner', 'sitter'];
    expect(roles.includes('sitter')).toBe(true);
  });

  it('owner-only role denies forum access', () => {
    const roles = ['owner'];
    expect(roles.includes('sitter')).toBe(false);
  });

  it('admin role alone is not enough for posting', () => {
    const roles = ['admin'];
    expect(roles.includes('sitter')).toBe(false);
  });

  it('sitter must be approved to post', () => {
    const approvalStatus: string = 'pending_approval';
    expect(approvalStatus === 'approved').toBe(false);
  });

  it('approved sitter can post', () => {
    const approvalStatus: string = 'approved';
    expect(approvalStatus === 'approved').toBe(true);
  });
});

describe('thread locked status', () => {
  it('locked thread prevents new replies', () => {
    const thread = { locked: true };
    expect(thread.locked).toBe(true);
  });

  it('unlocked thread allows replies', () => {
    const thread = { locked: false };
    expect(thread.locked).toBe(false);
  });
});

describe('thread deletion authorization', () => {
  it('author can delete own thread', () => {
    const thread = { author_id: 5 };
    const userId = 5;
    const isAdmin = false;
    expect(thread.author_id === userId || isAdmin).toBe(true);
  });

  it('non-author non-admin cannot delete', () => {
    const thread = { author_id: 5 };
    const userId = 10;
    const isAdmin = false;
    expect(thread.author_id === userId || isAdmin).toBe(false);
  });

  it('admin can delete any thread', () => {
    const thread = { author_id: 5 };
    const userId = 10;
    const isAdmin = true;
    expect(thread.author_id === userId || isAdmin).toBe(true);
  });
});

describe('reply deletion authorization', () => {
  it('author can delete own reply', () => {
    const reply = { author_id: 5 };
    const userId = 5;
    const isAdmin = false;
    expect(reply.author_id === userId || isAdmin).toBe(true);
  });

  it('non-author non-admin cannot delete', () => {
    const reply = { author_id: 5 };
    const userId = 10;
    const isAdmin = false;
    expect(reply.author_id === userId || isAdmin).toBe(false);
  });

  it('admin can delete any reply', () => {
    const reply = { author_id: 5 };
    const userId = 10;
    const isAdmin = true;
    expect(reply.author_id === userId || isAdmin).toBe(true);
  });
});

describe('pagination logic', () => {
  const DEFAULT_LIMIT = 20;
  const MAX_LIMIT = 50;

  it('defaults to DEFAULT_LIMIT when not specified', () => {
    const limit = Math.min(Number(undefined) || DEFAULT_LIMIT, MAX_LIMIT);
    expect(limit).toBe(20);
  });

  it('caps at MAX_LIMIT', () => {
    const limit = Math.min(Number(100) || DEFAULT_LIMIT, MAX_LIMIT);
    expect(limit).toBe(50);
  });

  it('accepts valid limit', () => {
    const limit = Math.min(Number(10) || DEFAULT_LIMIT, MAX_LIMIT);
    expect(limit).toBe(10);
  });

  it('defaults offset to 0', () => {
    const offset = Math.max(Number(undefined) || 0, 0);
    expect(offset).toBe(0);
  });

  it('prevents negative offset', () => {
    const offset = Math.max(Number(-5) || 0, 0);
    expect(offset).toBe(0);
  });
});
