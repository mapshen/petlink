import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';

describe('conversation list logic', () => {
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
        role TEXT DEFAULT 'owner',
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
    testDb.prepare("INSERT INTO users (email, password_hash, name) VALUES ('alice@test.com', 'hash', 'Alice')").run();
    testDb.prepare("INSERT INTO users (email, password_hash, name) VALUES ('bob@test.com', 'hash', 'Bob')").run();
    testDb.prepare("INSERT INTO users (email, password_hash, name) VALUES ('carol@test.com', 'hash', 'Carol')").run();
  });

  afterAll(() => {
    testDb.close();
  });

  // Portable conversation query (SQLite-compatible, mirrors PostgreSQL DISTINCT ON logic)
  function getConversations(userId: number) {
    return testDb.prepare(`
      WITH pairs AS (
        SELECT
          MIN(sender_id, receiver_id) AS user_a,
          MAX(sender_id, receiver_id) AS user_b,
          MAX(created_at) AS last_at
        FROM messages
        WHERE sender_id = ? OR receiver_id = ?
        GROUP BY MIN(sender_id, receiver_id), MAX(sender_id, receiver_id)
      ),
      last_msgs AS (
        SELECT m.*, p.user_a, p.user_b
        FROM pairs p
        JOIN messages m ON m.created_at = p.last_at
          AND MIN(m.sender_id, m.receiver_id) = p.user_a
          AND MAX(m.sender_id, m.receiver_id) = p.user_b
      ),
      unread AS (
        SELECT sender_id AS from_user, COUNT(*) AS unread
        FROM messages
        WHERE receiver_id = ? AND read_at IS NULL
        GROUP BY sender_id
      )
      SELECT
        u.id AS other_user_id,
        u.name AS other_user_name,
        u.avatar_url AS other_user_avatar,
        lm.content AS last_message,
        lm.created_at AS last_message_at,
        COALESCE(uc.unread, 0) AS unread_count
      FROM last_msgs lm
      JOIN users u ON u.id = CASE
        WHEN lm.sender_id = ? THEN lm.receiver_id
        ELSE lm.sender_id
      END
      LEFT JOIN unread uc ON uc.from_user = u.id
      ORDER BY lm.created_at DESC
    `).all(userId, userId, userId, userId) as Array<{
      other_user_id: number;
      other_user_name: string;
      other_user_avatar: string | null;
      last_message: string;
      last_message_at: string;
      unread_count: number;
    }>;
  }

  it('returns empty list when user has no messages', () => {
    const convos = getConversations(1);
    expect(convos).toHaveLength(0);
  });

  it('groups messages between same pair into one conversation', () => {
    testDb.prepare("INSERT INTO messages (sender_id, receiver_id, content, created_at) VALUES (1, 2, 'Hello Bob', '2026-03-01T10:00:00Z')").run();
    testDb.prepare("INSERT INTO messages (sender_id, receiver_id, content, created_at) VALUES (2, 1, 'Hi Alice', '2026-03-01T10:05:00Z')").run();
    testDb.prepare("INSERT INTO messages (sender_id, receiver_id, content, created_at) VALUES (1, 2, 'How are you?', '2026-03-01T10:10:00Z')").run();

    const convos = getConversations(1);
    expect(convos).toHaveLength(1);
    expect(convos[0].other_user_name).toBe('Bob');
    expect(convos[0].last_message).toBe('How are you?');
  });

  it('shows correct unread count for messages TO the user', () => {
    // All 3 messages above: 1 from Bob to Alice is unread (read_at is NULL)
    const convos = getConversations(1);
    expect(convos[0].unread_count).toBe(1);
  });

  it('marks messages as read and unread count becomes zero', () => {
    testDb.prepare("UPDATE messages SET read_at = CURRENT_TIMESTAMP WHERE sender_id = 2 AND receiver_id = 1").run();
    const convos = getConversations(1);
    expect(convos[0].unread_count).toBe(0);
  });

  it('orders conversations by most recent message', () => {
    // Add conversation with Carol, more recent
    testDb.prepare("INSERT INTO messages (sender_id, receiver_id, content, created_at) VALUES (3, 1, 'Hey from Carol', '2026-03-02T09:00:00Z')").run();

    const convos = getConversations(1);
    expect(convos).toHaveLength(2);
    expect(convos[0].other_user_name).toBe('Carol');
    expect(convos[1].other_user_name).toBe('Bob');
  });

  it('conversation appears for both participants', () => {
    const aliceConvos = getConversations(1);
    const bobConvos = getConversations(2);

    const aliceBobConvo = aliceConvos.find((c) => c.other_user_name === 'Bob');
    const bobAliceConvo = bobConvos.find((c) => c.other_user_name === 'Alice');

    expect(aliceBobConvo).toBeDefined();
    expect(bobAliceConvo).toBeDefined();
    expect(aliceBobConvo!.last_message).toBe(bobAliceConvo!.last_message);
  });

  it('resolves the correct other user for each side', () => {
    const aliceConvos = getConversations(1);
    const carolConvo = aliceConvos.find((c) => c.other_user_name === 'Carol');
    expect(carolConvo).toBeDefined();
    expect(carolConvo!.other_user_id).toBe(3);

    const carolConvos = getConversations(3);
    const aliceConvo = carolConvos.find((c) => c.other_user_name === 'Alice');
    expect(aliceConvo).toBeDefined();
    expect(aliceConvo!.other_user_id).toBe(1);
  });
});
