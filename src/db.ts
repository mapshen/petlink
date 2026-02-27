import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(process.cwd(), 'pawscout.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

export function initDb() {
  const schema = `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT CHECK(role IN ('owner', 'sitter', 'both')) NOT NULL DEFAULT 'owner',
      bio TEXT,
      avatar_url TEXT,
      lat REAL,
      lng REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS pets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      breed TEXT,
      age INTEGER,
      weight REAL,
      medical_history TEXT,
      photo_url TEXT,
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sitter_id INTEGER NOT NULL,
      type TEXT CHECK(type IN ('walking', 'sitting', 'drop-in', 'grooming')) NOT NULL,
      price REAL NOT NULL,
      description TEXT,
      FOREIGN KEY (sitter_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sitter_id INTEGER NOT NULL,
      owner_id INTEGER NOT NULL,
      pet_id INTEGER,
      service_id INTEGER,
      status TEXT CHECK(status IN ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled')) DEFAULT 'pending',
      start_time DATETIME NOT NULL,
      end_time DATETIME NOT NULL,
      total_price REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sitter_id) REFERENCES users(id),
      FOREIGN KEY (owner_id) REFERENCES users(id),
      FOREIGN KEY (pet_id) REFERENCES pets(id),
      FOREIGN KEY (service_id) REFERENCES services(id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER,
      sender_id INTEGER NOT NULL,
      receiver_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sender_id) REFERENCES users(id),
      FOREIGN KEY (receiver_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id INTEGER NOT NULL,
      reviewer_id INTEGER NOT NULL,
      reviewee_id INTEGER NOT NULL,
      rating INTEGER CHECK(rating >= 1 AND rating <= 5),
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (booking_id) REFERENCES bookings(id),
      FOREIGN KEY (reviewer_id) REFERENCES users(id),
      FOREIGN KEY (reviewee_id) REFERENCES users(id)
    );
  `;

  db.exec(schema);

  // Seed data if empty
  const userCount = db.prepare('SELECT count(*) as count FROM users').get() as { count: number };
  if (userCount.count === 0) {
    console.log('Seeding database...');
    const insertUser = db.prepare('INSERT INTO users (email, password_hash, name, role, bio, avatar_url, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const insertPet = db.prepare('INSERT INTO pets (owner_id, name, breed, age, weight, medical_history, photo_url) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const insertService = db.prepare('INSERT INTO services (sitter_id, type, price, description) VALUES (?, ?, ?, ?)');

    // Create a demo owner
    const ownerId = insertUser.run('owner@example.com', 'hash123', 'Alice Owner', 'owner', 'I love my dog!', 'https://i.pravatar.cc/150?u=alice', 37.7749, -122.4194).lastInsertRowid;
    insertPet.run(ownerId, 'Buddy', 'Golden Retriever', 3, 30, 'None', 'https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=150&q=80');

    // Create a demo sitter
    const sitterId = insertUser.run('sitter@example.com', 'hash123', 'Bob Sitter', 'sitter', 'Experienced dog walker and sitter.', 'https://i.pravatar.cc/150?u=bob', 37.7750, -122.4180).lastInsertRowid;
    insertService.run(sitterId, 'walking', 25, '30 minute walk around the neighborhood.');
    insertService.run(sitterId, 'sitting', 50, 'Overnight sitting at your home.');

    // Create a dual role user
    const dualId = insertUser.run('dual@example.com', 'hash123', 'Charlie Dual', 'both', 'I walk dogs and have a cat.', 'https://i.pravatar.cc/150?u=charlie', 37.7760, -122.4200).lastInsertRowid;
    insertPet.run(dualId, 'Mittens', 'Tabby Cat', 5, 5, 'Allergic to fish', 'https://images.unsplash.com/photo-1514888286974-6c03e2ca1dba?auto=format&fit=crop&w=150&q=80');
    insertService.run(dualId, 'drop-in', 20, 'Quick check-in and feeding.');

    console.log('Database seeded!');
  }
}

export default db;
