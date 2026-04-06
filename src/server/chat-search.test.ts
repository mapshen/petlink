import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';

describe('chat history search', () => {
  let testDb: ReturnType<typeof Database>;

  beforeAll(() => {
    testDb = new Database(':memory:');
    testDb.pragma('foreign_keys = ON');
    testDb.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        avatar_url TEXT
      );
      CREATE TABLE messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sender_id INTEGER NOT NULL,
        receiver_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        read_at DATETIME,
        FOREIGN KEY (sender_id) REFERENCES users(id),
        FOREIGN KEY (receiver_id) REFERENCES users(id)
      );
    `);

    // Seed users
    testDb.prepare("INSERT INTO users (email, name) VALUES ('alice@test.com', 'Alice')").run();
    testDb.prepare("INSERT INTO users (email, name) VALUES ('bob@test.com', 'Bob')").run();
    testDb.prepare("INSERT INTO users (email, name) VALUES ('carol@test.com', 'Carol')").run();

    // Seed messages: Alice <-> Bob conversations
    testDb.prepare("INSERT INTO messages (sender_id, receiver_id, content) VALUES (1, 2, 'Can you walk Buddy tomorrow?')").run();
    testDb.prepare("INSERT INTO messages (sender_id, receiver_id, content) VALUES (2, 1, 'Sure! What time works for you?')").run();
    testDb.prepare("INSERT INTO messages (sender_id, receiver_id, content) VALUES (1, 2, 'Around 3pm would be great. He needs his medication at 4pm.')").run();
    testDb.prepare("INSERT INTO messages (sender_id, receiver_id, content) VALUES (2, 1, 'Got it, I will bring treats for Buddy.')").run();

    // Alice <-> Carol conversations
    testDb.prepare("INSERT INTO messages (sender_id, receiver_id, content) VALUES (1, 3, 'Hi Carol, can you watch my cat this weekend?')").run();
    testDb.prepare("INSERT INTO messages (sender_id, receiver_id, content) VALUES (3, 1, 'Yes! I love cats. What is the address?')").run();
  });

  afterAll(() => { testDb.close(); });

  // --- Basic Search ---

  it('finds messages matching search term', () => {
    const results = testDb.prepare(`
      SELECT * FROM messages
      WHERE (sender_id = 1 OR receiver_id = 1)
        AND content LIKE '%Buddy%'
      ORDER BY created_at DESC
    `).all();

    expect(results.length).toBe(2); // "walk Buddy" + "treats for Buddy"
  });

  it('search is case-insensitive (LIKE with lower)', () => {
    const results = testDb.prepare(`
      SELECT * FROM messages
      WHERE (sender_id = 1 OR receiver_id = 1)
        AND lower(content) LIKE lower('%buddy%')
    `).all();

    expect(results.length).toBe(2);
  });

  it('returns empty for no matches', () => {
    const results = testDb.prepare(`
      SELECT * FROM messages
      WHERE (sender_id = 1 OR receiver_id = 1)
        AND content LIKE '%nonexistent_xyz%'
    `).all();

    expect(results).toHaveLength(0);
  });

  // --- Conversation Filter ---

  it('filters search to specific conversation partner', () => {
    const results = testDb.prepare(`
      SELECT * FROM messages
      WHERE ((sender_id = 1 AND receiver_id = 2) OR (sender_id = 2 AND receiver_id = 1))
        AND content LIKE '%weekend%'
    `).all();

    expect(results).toHaveLength(0); // "weekend" only in Alice-Carol conversation
  });

  it('finds messages in specific conversation', () => {
    const results = testDb.prepare(`
      SELECT * FROM messages
      WHERE ((sender_id = 1 AND receiver_id = 3) OR (sender_id = 3 AND receiver_id = 1))
        AND content LIKE '%cat%'
    `).all();

    expect(results).toHaveLength(2); // "my cat" + "love cats"
  });

  // --- Pagination ---

  it('respects limit parameter', () => {
    const results = testDb.prepare(`
      SELECT * FROM messages
      WHERE (sender_id = 1 OR receiver_id = 1)
        AND content LIKE '%a%'
      LIMIT 2
    `).all();

    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('respects offset parameter', () => {
    const all = testDb.prepare(`
      SELECT * FROM messages
      WHERE (sender_id = 1 OR receiver_id = 1)
        AND content LIKE '%a%'
      ORDER BY created_at DESC
    `).all();

    const offset2 = testDb.prepare(`
      SELECT * FROM messages
      WHERE (sender_id = 1 OR receiver_id = 1)
        AND content LIKE '%a%'
      ORDER BY created_at DESC
      LIMIT 10 OFFSET 2
    `).all();

    expect(offset2.length).toBe(all.length - 2);
  });

  // --- Total Count ---

  it('returns correct total count', () => {
    const [{ total }] = testDb.prepare(`
      SELECT count(*) as total FROM messages
      WHERE (sender_id = 1 OR receiver_id = 1)
        AND content LIKE '%Buddy%'
    `).all() as { total: number }[];

    expect(total).toBe(2);
  });

  // --- User Context ---

  it('only searches messages the user is part of', () => {
    // User 3 (Carol) should not see Alice-Bob messages
    const results = testDb.prepare(`
      SELECT * FROM messages
      WHERE (sender_id = 3 OR receiver_id = 3)
        AND content LIKE '%Buddy%'
    `).all();

    expect(results).toHaveLength(0);
  });

  // --- Special Characters ---

  it('handles special characters in search safely', () => {
    // SQL injection attempt via search term — parameterized queries prevent this
    const term = "'; DROP TABLE messages; --";
    const pattern = `%${term}%`;
    const results = testDb.prepare(`
      SELECT * FROM messages
      WHERE (sender_id = 1 OR receiver_id = 1)
        AND content LIKE ?
    `).all(pattern);

    expect(results).toHaveLength(0); // No match, no crash
  });

  it('handles percent signs in search', () => {
    const term = '100%';
    const pattern = `%${term}%`;
    const results = testDb.prepare(`
      SELECT * FROM messages
      WHERE (sender_id = 1 OR receiver_id = 1)
        AND content LIKE ?
    `).all(pattern);

    expect(results).toHaveLength(0);
  });
});
