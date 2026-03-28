import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

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
      bio TEXT, avatar_url TEXT, lat REAL, lng REAL,
      accepted_pet_sizes TEXT DEFAULT '[]',
      accepted_species TEXT DEFAULT '[]',
      years_experience INTEGER,
      home_type TEXT,
      has_yard INTEGER DEFAULT 0,
      has_fenced_yard INTEGER DEFAULT 0,
      has_own_pets INTEGER DEFAULT 0,
      own_pets_description TEXT,
      skills TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE pets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      species TEXT DEFAULT 'dog',
      breed TEXT,
      age INTEGER,
      weight REAL,
      gender TEXT,
      spayed_neutered INTEGER,
      energy_level TEXT,
      house_trained INTEGER,
      temperament TEXT DEFAULT '[]',
      special_needs TEXT,
      microchip_number TEXT,
      vet_name TEXT,
      vet_phone TEXT,
      emergency_contact_name TEXT,
      emergency_contact_phone TEXT,
      medical_history TEXT,
      photo_url TEXT
    );
    CREATE TABLE pet_vaccinations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pet_id INTEGER NOT NULL REFERENCES pets(id) ON DELETE CASCADE,
      vaccine_name TEXT NOT NULL,
      administered_date TEXT,
      expires_at TEXT,
      document_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sitter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      price REAL NOT NULL,
      description TEXT,
      additional_pet_price REAL DEFAULT 0,
      max_pets INTEGER DEFAULT 1,
      service_details TEXT
    );
  `);

  const hash = bcrypt.hashSync('pass', 10);
  db.prepare("INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)").run('owner@test.com', hash, 'Owner', 'owner');
  db.prepare("INSERT INTO users (email, password_hash, name, role, years_experience, home_type, has_yard, has_fenced_yard) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run('sitter@test.com', hash, 'Sitter', 'sitter', 5, 'house', 1, 1);

  return db;
}

describe('granular pet profiles', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => { db = createTestDb(); });

  it('stores extended pet fields', () => {
    db.prepare(`
      INSERT INTO pets (owner_id, name, species, breed, age, weight, gender, spayed_neutered, energy_level, house_trained, temperament, special_needs, microchip_number, vet_name, vet_phone, emergency_contact_name, emergency_contact_phone)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(1, 'Buddy', 'dog', 'Golden Retriever', 3, 65.5, 'male', 1, 'high', 1, '["friendly","playful"]', 'Needs daily medication', 'CHIP123', 'Dr. Smith', '555-0100', 'Jane Doe', '555-0200');

    const pet = db.prepare('SELECT * FROM pets WHERE name = ?').get('Buddy') as Record<string, unknown>;
    expect(pet.species).toBe('dog');
    expect(pet.gender).toBe('male');
    expect(pet.spayed_neutered).toBe(1);
    expect(pet.energy_level).toBe('high');
    expect(pet.house_trained).toBe(1);
    expect(pet.microchip_number).toBe('CHIP123');
    expect(pet.vet_name).toBe('Dr. Smith');
    expect(pet.emergency_contact_name).toBe('Jane Doe');
  });

  it('defaults species to dog', () => {
    db.prepare('INSERT INTO pets (owner_id, name) VALUES (?, ?)').run(1, 'Rex');
    const pet = db.prepare('SELECT species FROM pets WHERE name = ?').get('Rex') as Record<string, unknown>;
    expect(pet.species).toBe('dog');
  });

  it('cascades pet deletion to vaccinations', () => {
    db.prepare('INSERT INTO pets (owner_id, name) VALUES (?, ?)').run(1, 'Buddy');
    db.prepare('INSERT INTO pet_vaccinations (pet_id, vaccine_name) VALUES (?, ?)').run(1, 'Rabies');
    db.prepare('INSERT INTO pet_vaccinations (pet_id, vaccine_name) VALUES (?, ?)').run(1, 'DHPP');

    db.prepare('DELETE FROM pets WHERE id = ?').run(1);
    const vaccs = db.prepare('SELECT * FROM pet_vaccinations WHERE pet_id = 1').all();
    expect(vaccs).toHaveLength(0);
  });

  it('cascades user deletion to pets and vaccinations', () => {
    db.prepare('INSERT INTO pets (owner_id, name) VALUES (?, ?)').run(1, 'Buddy');
    db.prepare('INSERT INTO pet_vaccinations (pet_id, vaccine_name) VALUES (?, ?)').run(1, 'Rabies');

    db.prepare('DELETE FROM users WHERE id = ?').run(1);
    expect(db.prepare('SELECT * FROM pets WHERE owner_id = 1').all()).toHaveLength(0);
    expect(db.prepare('SELECT * FROM pet_vaccinations WHERE pet_id = 1').all()).toHaveLength(0);
  });
});

describe('pet vaccinations', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => { db = createTestDb(); });

  it('stores vaccination with all fields', () => {
    db.prepare('INSERT INTO pets (owner_id, name) VALUES (?, ?)').run(1, 'Buddy');
    db.prepare('INSERT INTO pet_vaccinations (pet_id, vaccine_name, administered_date, expires_at, document_url) VALUES (?, ?, ?, ?, ?)').run(1, 'Rabies', '2025-01-15', '2026-01-15', 'https://example.com/cert.pdf');

    const vacc = db.prepare('SELECT * FROM pet_vaccinations WHERE pet_id = 1').get() as Record<string, unknown>;
    expect(vacc.vaccine_name).toBe('Rabies');
    expect(vacc.administered_date).toBe('2025-01-15');
    expect(vacc.expires_at).toBe('2026-01-15');
    expect(vacc.document_url).toBe('https://example.com/cert.pdf');
  });

  it('allows multiple vaccinations per pet', () => {
    db.prepare('INSERT INTO pets (owner_id, name) VALUES (?, ?)').run(1, 'Buddy');
    db.prepare('INSERT INTO pet_vaccinations (pet_id, vaccine_name) VALUES (?, ?)').run(1, 'Rabies');
    db.prepare('INSERT INTO pet_vaccinations (pet_id, vaccine_name) VALUES (?, ?)').run(1, 'DHPP');
    db.prepare('INSERT INTO pet_vaccinations (pet_id, vaccine_name) VALUES (?, ?)').run(1, 'Bordetella');

    const vaccs = db.prepare('SELECT * FROM pet_vaccinations WHERE pet_id = 1').all();
    expect(vaccs).toHaveLength(3);
  });

  it('rejects vaccination for non-existent pet', () => {
    expect(() => {
      db.prepare('INSERT INTO pet_vaccinations (pet_id, vaccine_name) VALUES (?, ?)').run(999, 'Rabies');
    }).toThrow();
  });
});

describe('sitter profile details', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => { db = createTestDb(); });

  it('stores sitter home environment fields', () => {
    const sitter = db.prepare('SELECT years_experience, home_type, has_yard, has_fenced_yard FROM users WHERE id = 2').get() as Record<string, unknown>;
    expect(sitter.years_experience).toBe(5);
    expect(sitter.home_type).toBe('house');
    expect(sitter.has_yard).toBe(1);
    expect(sitter.has_fenced_yard).toBe(1);
  });

  it('updates sitter details', () => {
    db.prepare('UPDATE users SET has_own_pets = 1, own_pets_description = ? WHERE id = 2').run('1 cat named Whiskers');
    const sitter = db.prepare('SELECT has_own_pets, own_pets_description FROM users WHERE id = 2').get() as Record<string, unknown>;
    expect(sitter.has_own_pets).toBe(1);
    expect(sitter.own_pets_description).toBe('1 cat named Whiskers');
  });
});

describe('service details', () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => { db = createTestDb(); });

  it('stores max_pets on services', () => {
    db.prepare('INSERT INTO services (sitter_id, type, price, max_pets) VALUES (?, ?, ?, ?)').run(2, 'walking', 25, 3);
    const svc = db.prepare('SELECT max_pets FROM services WHERE sitter_id = 2').get() as Record<string, unknown>;
    expect(svc.max_pets).toBe(3);
  });

  it('defaults max_pets to 1', () => {
    db.prepare('INSERT INTO services (sitter_id, type, price) VALUES (?, ?, ?)').run(2, 'sitting', 50);
    const svc = db.prepare('SELECT max_pets FROM services WHERE type = ?').get('sitting') as Record<string, unknown>;
    expect(svc.max_pets).toBe(1);
  });

  it('stores service_details JSON', () => {
    const details = JSON.stringify({ duration_minutes: 30, solo_walk: true });
    db.prepare('INSERT INTO services (sitter_id, type, price, service_details) VALUES (?, ?, ?, ?)').run(2, 'walking', 25, details);
    const svc = db.prepare('SELECT service_details FROM services WHERE sitter_id = 2').get() as Record<string, unknown>;
    const parsed = JSON.parse(svc.service_details as string);
    expect(parsed.duration_minutes).toBe(30);
    expect(parsed.solo_walk).toBe(true);
  });
});
