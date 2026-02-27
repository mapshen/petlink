import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const testDbPath = path.join(process.cwd(), 'test_notifications.db');

describe('notifications', () => {
  let testDb: ReturnType<typeof Database>;

  beforeAll(async () => {
    // Create test database with required tables
    testDb = new Database(testDbPath);
    testDb.pragma('foreign_keys = ON');
    testDb.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT DEFAULT 'owner'
      );
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        data TEXT,
        read BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS notification_preferences (
        user_id INTEGER PRIMARY KEY,
        new_booking BOOLEAN DEFAULT 1,
        booking_status BOOLEAN DEFAULT 1,
        new_message BOOLEAN DEFAULT 1,
        walk_updates BOOLEAN DEFAULT 1,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    testDb.prepare("INSERT INTO users (email, password_hash, name) VALUES ('test@test.com', 'hash', 'Test User')").run();
  });

  afterAll(() => {
    testDb.close();
    fs.unlinkSync(testDbPath);
  });

  it('inserts a notification', () => {
    testDb.prepare("INSERT INTO notifications (user_id, type, title, body) VALUES (1, 'new_booking', 'Test', 'Test body')").run();
    const row = testDb.prepare('SELECT * FROM notifications WHERE user_id = 1').get() as Record<string, unknown>;
    expect(row.title).toBe('Test');
    expect(row.read).toBe(0);
  });

  it('marks notification as read', () => {
    const info = testDb.prepare('UPDATE notifications SET read = 1 WHERE id = 1 AND user_id = 1').run();
    expect(info.changes).toBe(1);
    const row = testDb.prepare('SELECT read FROM notifications WHERE id = 1').get() as Record<string, unknown>;
    expect(row.read).toBe(1);
  });

  it('stores and retrieves notification preferences', () => {
    testDb.prepare("INSERT INTO notification_preferences (user_id, new_booking, new_message) VALUES (1, 0, 1)").run();
    const prefs = testDb.prepare('SELECT * FROM notification_preferences WHERE user_id = 1').get() as Record<string, unknown>;
    expect(prefs.new_booking).toBe(0);
    expect(prefs.new_message).toBe(1);
  });

  it('counts unread notifications', () => {
    testDb.prepare('UPDATE notifications SET read = 0 WHERE user_id = 1').run();
    testDb.prepare("INSERT INTO notifications (user_id, type, title, body) VALUES (1, 'new_message', 'Msg', 'Hello')").run();
    const row = testDb.prepare('SELECT count(*) as count FROM notifications WHERE user_id = 1 AND read = 0').get() as { count: number };
    expect(row.count).toBe(2);
  });
});
