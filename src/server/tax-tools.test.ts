import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { expenseSchema } from './validation.ts';

// --- Schema Validation Tests ---

describe('expenseSchema', () => {
  const validExpense = {
    category: 'supplies',
    amount: 25.50,
    description: 'Dog treats and leashes',
    date: '2025-06-15',
    receipt_url: 'https://example.com/receipt.pdf',
  };

  it('accepts valid expense data', () => {
    const result = expenseSchema.safeParse(validExpense);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category).toBe('supplies');
      expect(result.data.amount).toBe(25.50);
    }
  });

  it('accepts all valid categories', () => {
    const categories = ['supplies', 'transportation', 'insurance', 'marketing', 'equipment', 'training', 'other'];
    for (const category of categories) {
      const result = expenseSchema.safeParse({ ...validExpense, category });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid category', () => {
    const result = expenseSchema.safeParse({ ...validExpense, category: 'food' });
    expect(result.success).toBe(false);
  });

  it('rejects zero amount', () => {
    const result = expenseSchema.safeParse({ ...validExpense, amount: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects negative amount', () => {
    const result = expenseSchema.safeParse({ ...validExpense, amount: -10 });
    expect(result.success).toBe(false);
  });

  it('rejects amount exceeding maximum', () => {
    const result = expenseSchema.safeParse({ ...validExpense, amount: 100000 });
    expect(result.success).toBe(false);
  });

  it('accepts amount at maximum boundary', () => {
    const result = expenseSchema.safeParse({ ...validExpense, amount: 99999 });
    expect(result.success).toBe(true);
  });

  it('rejects invalid date format', () => {
    const result = expenseSchema.safeParse({ ...validExpense, date: '06/15/2025' });
    expect(result.success).toBe(false);
  });

  it('rejects non-date string', () => {
    const result = expenseSchema.safeParse({ ...validExpense, date: 'not-a-date' });
    expect(result.success).toBe(false);
  });

  it('accepts expense without optional fields', () => {
    const result = expenseSchema.safeParse({
      category: 'transportation',
      amount: 15,
      date: '2025-03-01',
    });
    expect(result.success).toBe(true);
  });

  it('rejects description over 500 characters', () => {
    const result = expenseSchema.safeParse({ ...validExpense, description: 'x'.repeat(501) });
    expect(result.success).toBe(false);
  });

  it('accepts description at 500 characters', () => {
    const result = expenseSchema.safeParse({ ...validExpense, description: 'x'.repeat(500) });
    expect(result.success).toBe(true);
  });

  it('rejects invalid receipt URL', () => {
    const result = expenseSchema.safeParse({ ...validExpense, receipt_url: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('accepts empty string receipt URL', () => {
    const result = expenseSchema.safeParse({ ...validExpense, receipt_url: '' });
    expect(result.success).toBe(true);
  });
});

// --- Database Integration Tests ---

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
      bio TEXT, avatar_url TEXT, lat REAL, lng REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE sitter_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sitter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category TEXT NOT NULL CHECK(category IN ('supplies', 'transportation', 'insurance', 'marketing', 'equipment', 'training', 'other')),
      amount REAL NOT NULL CHECK(amount > 0),
      description TEXT,
      date TEXT NOT NULL,
      receipt_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sitter_id INTEGER NOT NULL REFERENCES users(id),
      owner_id INTEGER NOT NULL REFERENCES users(id),
      status TEXT DEFAULT 'pending',
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      total_price REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX idx_sitter_expenses_sitter_id ON sitter_expenses (sitter_id);
  `);

  const hash = bcrypt.hashSync('pass', 10);
  db.prepare("INSERT INTO users (email, password_hash, name, roles) VALUES (?, ?, ?, ?)").run('owner@test.com', hash, 'Owner', 'owner');
  db.prepare("INSERT INTO users (email, password_hash, name, roles) VALUES (?, ?, ?, ?)").run('sitter@test.com', hash, 'Sitter', 'owner,sitter');
  db.prepare("INSERT INTO users (email, password_hash, name, roles) VALUES (?, ?, ?, ?)").run('dual@test.com', hash, 'Dual', 'owner,sitter');

  return db;
}

describe('sitter_expenses table', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => { db = createTestDb(); });

  it('should create an expense', () => {
    db.prepare('INSERT INTO sitter_expenses (sitter_id, category, amount, description, date) VALUES (?, ?, ?, ?, ?)').run(2, 'supplies', 25.50, 'Dog treats', '2025-06-15');
    const expense = db.prepare('SELECT * FROM sitter_expenses WHERE sitter_id = 2').get() as Record<string, unknown>;
    expect(expense).toBeDefined();
    expect(expense.category).toBe('supplies');
    expect(expense.amount).toBe(25.50);
    expect(expense.description).toBe('Dog treats');
    expect(expense.date).toBe('2025-06-15');
  });

  it('should read expenses for a sitter', () => {
    db.prepare('INSERT INTO sitter_expenses (sitter_id, category, amount, date) VALUES (?, ?, ?, ?)').run(2, 'supplies', 10, '2025-01-01');
    db.prepare('INSERT INTO sitter_expenses (sitter_id, category, amount, date) VALUES (?, ?, ?, ?)').run(2, 'transportation', 20, '2025-02-01');
    db.prepare('INSERT INTO sitter_expenses (sitter_id, category, amount, date) VALUES (?, ?, ?, ?)').run(3, 'insurance', 100, '2025-01-01');
    const expenses = db.prepare('SELECT * FROM sitter_expenses WHERE sitter_id = ?').all(2) as Record<string, unknown>[];
    expect(expenses).toHaveLength(2);
  });

  it('should update an expense', () => {
    db.prepare('INSERT INTO sitter_expenses (sitter_id, category, amount, date) VALUES (?, ?, ?, ?)').run(2, 'supplies', 10, '2025-01-01');
    db.prepare('UPDATE sitter_expenses SET amount = ?, category = ? WHERE id = 1 AND sitter_id = 2').run(30, 'equipment');
    const expense = db.prepare('SELECT * FROM sitter_expenses WHERE id = 1').get() as Record<string, unknown>;
    expect(expense.amount).toBe(30);
    expect(expense.category).toBe('equipment');
  });

  it('should delete an expense', () => {
    db.prepare('INSERT INTO sitter_expenses (sitter_id, category, amount, date) VALUES (?, ?, ?, ?)').run(2, 'supplies', 10, '2025-01-01');
    db.prepare('DELETE FROM sitter_expenses WHERE id = 1 AND sitter_id = 2').run();
    const expense = db.prepare('SELECT * FROM sitter_expenses WHERE id = 1').get();
    expect(expense).toBeUndefined();
  });

  it('should reject invalid category via CHECK constraint', () => {
    expect(() => {
      db.prepare('INSERT INTO sitter_expenses (sitter_id, category, amount, date) VALUES (?, ?, ?, ?)').run(2, 'food', 10, '2025-01-01');
    }).toThrow();
  });

  it('should reject zero amount via CHECK constraint', () => {
    expect(() => {
      db.prepare('INSERT INTO sitter_expenses (sitter_id, category, amount, date) VALUES (?, ?, ?, ?)').run(2, 'supplies', 0, '2025-01-01');
    }).toThrow();
  });

  it('should reject negative amount via CHECK constraint', () => {
    expect(() => {
      db.prepare('INSERT INTO sitter_expenses (sitter_id, category, amount, date) VALUES (?, ?, ?, ?)').run(2, 'supplies', -5, '2025-01-01');
    }).toThrow();
  });

  it('should cascade delete when sitter user is deleted', () => {
    db.prepare('INSERT INTO sitter_expenses (sitter_id, category, amount, date) VALUES (?, ?, ?, ?)').run(2, 'supplies', 10, '2025-01-01');
    db.prepare('INSERT INTO sitter_expenses (sitter_id, category, amount, date) VALUES (?, ?, ?, ?)').run(2, 'transportation', 20, '2025-02-01');
    db.prepare('DELETE FROM users WHERE id = ?').run(2);
    const expenses = db.prepare('SELECT * FROM sitter_expenses WHERE sitter_id = 2').all();
    expect(expenses).toHaveLength(0);
  });

  it('should not affect other sitters expenses on delete', () => {
    db.prepare('INSERT INTO sitter_expenses (sitter_id, category, amount, date) VALUES (?, ?, ?, ?)').run(2, 'supplies', 10, '2025-01-01');
    db.prepare('INSERT INTO sitter_expenses (sitter_id, category, amount, date) VALUES (?, ?, ?, ?)').run(3, 'insurance', 50, '2025-01-01');
    db.prepare('DELETE FROM users WHERE id = ?').run(2);
    const expenses = db.prepare('SELECT * FROM sitter_expenses WHERE sitter_id = 3').all() as Record<string, unknown>[];
    expect(expenses).toHaveLength(1);
    expect(expenses[0].category).toBe('insurance');
  });

  it('should store receipt URL', () => {
    db.prepare('INSERT INTO sitter_expenses (sitter_id, category, amount, date, receipt_url) VALUES (?, ?, ?, ?, ?)').run(2, 'supplies', 10, '2025-01-01', 'https://example.com/receipt.pdf');
    const expense = db.prepare('SELECT * FROM sitter_expenses WHERE id = 1').get() as Record<string, unknown>;
    expect(expense.receipt_url).toBe('https://example.com/receipt.pdf');
  });

  it('should allow null description and receipt_url', () => {
    db.prepare('INSERT INTO sitter_expenses (sitter_id, category, amount, date) VALUES (?, ?, ?, ?)').run(2, 'training', 100, '2025-03-01');
    const expense = db.prepare('SELECT * FROM sitter_expenses WHERE id = 1').get() as Record<string, unknown>;
    expect(expense.description).toBeNull();
    expect(expense.receipt_url).toBeNull();
  });

  it('should compute expense totals by category', () => {
    db.prepare('INSERT INTO sitter_expenses (sitter_id, category, amount, date) VALUES (?, ?, ?, ?)').run(2, 'supplies', 10, '2025-01-01');
    db.prepare('INSERT INTO sitter_expenses (sitter_id, category, amount, date) VALUES (?, ?, ?, ?)').run(2, 'supplies', 20, '2025-02-01');
    db.prepare('INSERT INTO sitter_expenses (sitter_id, category, amount, date) VALUES (?, ?, ?, ?)').run(2, 'transportation', 15, '2025-03-01');

    const rows = db.prepare(`
      SELECT category, SUM(amount) AS total
      FROM sitter_expenses
      WHERE sitter_id = ?
      GROUP BY category
    `).all(2) as { category: string; total: number }[];

    const byCategory: Record<string, number> = {};
    for (const row of rows) {
      byCategory[row.category] = row.total;
    }
    expect(byCategory['supplies']).toBe(30);
    expect(byCategory['transportation']).toBe(15);
  });

  it('should compute tax summary with income and expenses', () => {
    // Add completed bookings for income
    db.prepare("INSERT INTO bookings (sitter_id, owner_id, status, start_time, end_time, total_price) VALUES (?, ?, ?, ?, ?, ?)").run(2, 1, 'completed', '2025-06-01T10:00:00Z', '2025-06-01T11:00:00Z', 50);
    db.prepare("INSERT INTO bookings (sitter_id, owner_id, status, start_time, end_time, total_price) VALUES (?, ?, ?, ?, ?, ?)").run(2, 1, 'completed', '2025-07-01T10:00:00Z', '2025-07-01T11:00:00Z', 75);
    // Non-completed booking should not count
    db.prepare("INSERT INTO bookings (sitter_id, owner_id, status, start_time, end_time, total_price) VALUES (?, ?, ?, ?, ?, ?)").run(2, 1, 'cancelled', '2025-08-01T10:00:00Z', '2025-08-01T11:00:00Z', 30);

    // Add expenses
    db.prepare('INSERT INTO sitter_expenses (sitter_id, category, amount, date) VALUES (?, ?, ?, ?)').run(2, 'supplies', 20, '2025-06-15');
    db.prepare('INSERT INTO sitter_expenses (sitter_id, category, amount, date) VALUES (?, ?, ?, ?)').run(2, 'transportation', 10, '2025-07-15');

    // Compute income (completed bookings where start_time year = 2025)
    const incomeRow = db.prepare(`
      SELECT COALESCE(SUM(total_price), 0) AS total_income
      FROM bookings
      WHERE sitter_id = ? AND status = 'completed'
        AND strftime('%Y', start_time) = ?
    `).get(2, '2025') as { total_income: number };

    // Compute expenses by category
    const expenseRows = db.prepare(`
      SELECT category, SUM(amount) AS total
      FROM sitter_expenses
      WHERE sitter_id = ? AND strftime('%Y', date) = ?
      GROUP BY category
    `).all(2, '2025') as { category: string; total: number }[];

    const total_expenses = expenseRows.reduce((sum, r) => sum + r.total, 0);
    const net_income = incomeRow.total_income - total_expenses;

    expect(incomeRow.total_income).toBe(125);
    expect(total_expenses).toBe(30);
    expect(net_income).toBe(95);
  });
});
