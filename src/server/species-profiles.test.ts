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
      password_hash TEXT,
      name TEXT NOT NULL,
      roles TEXT DEFAULT 'owner',
      approval_status TEXT DEFAULT 'approved',
      non_smoking_home BOOLEAN DEFAULT 0,
      children_in_home BOOLEAN DEFAULT 0,
      one_client_at_a_time BOOLEAN DEFAULT 0,
      safety_environment TEXT,
      typical_day TEXT,
      info_wanted_about_pets TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE sitter_species_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sitter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      species TEXT NOT NULL,
      years_experience INTEGER,
      accepted_pet_sizes TEXT DEFAULT '',
      skills TEXT DEFAULT '',
      max_pets INTEGER DEFAULT 1,
      max_pets_per_walk INTEGER,
      has_yard BOOLEAN DEFAULT 0,
      has_fenced_yard BOOLEAN DEFAULT 0,
      dogs_on_furniture BOOLEAN DEFAULT 0,
      dogs_on_bed BOOLEAN DEFAULT 0,
      potty_break_frequency TEXT,
      accepts_puppies BOOLEAN DEFAULT 1,
      accepts_unspayed BOOLEAN DEFAULT 1,
      accepts_unneutered BOOLEAN DEFAULT 1,
      accepts_females_in_heat BOOLEAN DEFAULT 1,
      owns_same_species BOOLEAN DEFAULT 0,
      own_pets_description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(sitter_id, species)
    );
    CREATE TABLE services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sitter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      price_cents INTEGER NOT NULL,
      description TEXT,
      species TEXT,
      holiday_rate_cents INTEGER,
      puppy_rate_cents INTEGER,
      duration_60_rate_cents INTEGER,
      extended_care_pct INTEGER,
      pickup_dropoff_fee_cents INTEGER,
      grooming_addon_fee_cents INTEGER,
      cat_care_rate_cents INTEGER,
      additional_cat_rate_cents INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const hash = bcrypt.hashSync('pass', 10);
  db.prepare("INSERT INTO users (email, password_hash, name, roles) VALUES (?, ?, ?, ?)").run('sitter@test.com', hash, 'Sitter', 'owner,sitter');

  return db;
}

describe('sitter_species_profiles schema', () => {
  let db: ReturnType<typeof createTestDb>;
  beforeEach(() => { db = createTestDb(); });

  it('creates a dog species profile', () => {
    db.prepare(`INSERT INTO sitter_species_profiles (sitter_id, species, years_experience, max_pets, has_yard, has_fenced_yard, dogs_on_furniture, dogs_on_bed, potty_break_frequency, accepts_puppies, accepts_unspayed)
      VALUES (1, 'dog', 10, 4, 1, 1, 1, 1, '2-4 hours', 0, 0)`).run();

    const profile = db.prepare('SELECT * FROM sitter_species_profiles WHERE sitter_id = 1 AND species = ?').get('dog') as Record<string, unknown>;
    expect(profile.years_experience).toBe(10);
    expect(profile.max_pets).toBe(4);
    expect(profile.has_fenced_yard).toBe(1);
    expect(profile.dogs_on_furniture).toBe(1);
    expect(profile.dogs_on_bed).toBe(1);
    expect(profile.potty_break_frequency).toBe('2-4 hours');
    expect(profile.accepts_puppies).toBe(0);
    expect(profile.accepts_unspayed).toBe(0);
  });

  it('creates a cat species profile', () => {
    db.prepare("INSERT INTO sitter_species_profiles (sitter_id, species, years_experience, max_pets, owns_same_species, own_pets_description) VALUES (1, 'cat', 3, 3, 1, '1 indoor cat')").run();

    const profile = db.prepare('SELECT * FROM sitter_species_profiles WHERE sitter_id = 1 AND species = ?').get('cat') as Record<string, unknown>;
    expect(profile.years_experience).toBe(3);
    expect(profile.owns_same_species).toBe(1);
    expect(profile.own_pets_description).toBe('1 indoor cat');
  });

  it('enforces unique sitter_id + species', () => {
    db.prepare("INSERT INTO sitter_species_profiles (sitter_id, species) VALUES (1, 'dog')").run();
    expect(() => {
      db.prepare("INSERT INTO sitter_species_profiles (sitter_id, species) VALUES (1, 'dog')").run();
    }).toThrow();
  });

  it('allows multiple species for same sitter', () => {
    db.prepare("INSERT INTO sitter_species_profiles (sitter_id, species) VALUES (1, 'dog')").run();
    db.prepare("INSERT INTO sitter_species_profiles (sitter_id, species) VALUES (1, 'cat')").run();
    const count = db.prepare('SELECT COUNT(*) as count FROM sitter_species_profiles WHERE sitter_id = 1').get() as { count: number };
    expect(count.count).toBe(2);
  });

  it('cascades delete when sitter is deleted', () => {
    db.prepare("INSERT INTO sitter_species_profiles (sitter_id, species) VALUES (1, 'dog')").run();
    db.prepare('DELETE FROM users WHERE id = 1').run();
    const count = db.prepare('SELECT COUNT(*) as count FROM sitter_species_profiles').get() as { count: number };
    expect(count.count).toBe(0);
  });
});

describe('services with species and pricing fields', () => {
  let db: ReturnType<typeof createTestDb>;
  beforeEach(() => { db = createTestDb(); });

  it('creates a service with species and granular pricing', () => {
    db.prepare(`INSERT INTO services (sitter_id, type, price_cents, species, holiday_rate_cents, puppy_rate_cents, duration_60_rate_cents, extended_care_pct, pickup_dropoff_fee_cents, grooming_addon_fee_cents)
      VALUES (1, 'sitting', 5500, 'dog', 8500, 6500, NULL, 50, 7000, 5000)`).run();

    const svc = db.prepare('SELECT * FROM services WHERE sitter_id = 1').get() as Record<string, unknown>;
    expect(svc.species).toBe('dog');
    expect(svc.holiday_rate_cents).toBe(8500);
    expect(svc.puppy_rate_cents).toBe(6500);
    expect(svc.extended_care_pct).toBe(50);
    expect(svc.pickup_dropoff_fee_cents).toBe(7000);
    expect(svc.grooming_addon_fee_cents).toBe(5000);
  });

  it('creates a cat service with cat-specific rates', () => {
    db.prepare("INSERT INTO services (sitter_id, type, price_cents, species, holiday_rate_cents) VALUES (1, 'sitting', 3500, 'cat', 4500)").run();

    const svc = db.prepare("SELECT * FROM services WHERE species = 'cat'").get() as Record<string, unknown>;
    expect(svc.price_cents).toBe(3500);
    expect(svc.holiday_rate_cents).toBe(4500);
  });

  it('allows same service type with different species', () => {
    db.prepare("INSERT INTO services (sitter_id, type, price_cents, species) VALUES (1, 'sitting', 5500, 'dog')").run();
    db.prepare("INSERT INTO services (sitter_id, type, price_cents, species) VALUES (1, 'sitting', 3500, 'cat')").run();
    const count = db.prepare("SELECT COUNT(*) as count FROM services WHERE sitter_id = 1 AND type = 'sitting'").get() as { count: number };
    expect(count.count).toBe(2);
  });

  it('creates meet_greet with null species (shared)', () => {
    db.prepare("INSERT INTO services (sitter_id, type, price_cents, species) VALUES (1, 'meet_greet', 0, NULL)").run();
    const svc = db.prepare("SELECT * FROM services WHERE type = 'meet_greet'").get() as Record<string, unknown>;
    expect(svc.species).toBeNull();
  });

  it('stores cat_care_rate_cents and additional_cat_rate_cents on dog services', () => {
    db.prepare("INSERT INTO services (sitter_id, type, price_cents, species, cat_care_rate_cents, additional_cat_rate_cents) VALUES (1, 'sitting', 7500, 'dog', 4200, 2700)").run();
    const svc = db.prepare('SELECT * FROM services WHERE sitter_id = 1').get() as Record<string, unknown>;
    expect(svc.cat_care_rate_cents).toBe(4200);
    expect(svc.additional_cat_rate_cents).toBe(2700);
  });
});

describe('users global sitter fields', () => {
  let db: ReturnType<typeof createTestDb>;
  beforeEach(() => { db = createTestDb(); });

  it('stores new global environment fields', () => {
    db.prepare("UPDATE users SET non_smoking_home = 1, children_in_home = 0, one_client_at_a_time = 1 WHERE id = 1").run();
    const user = db.prepare('SELECT non_smoking_home, children_in_home, one_client_at_a_time FROM users WHERE id = 1').get() as Record<string, unknown>;
    expect(user.non_smoking_home).toBe(1);
    expect(user.children_in_home).toBe(0);
    expect(user.one_client_at_a_time).toBe(1);
  });

  it('stores free text fields', () => {
    db.prepare("UPDATE users SET safety_environment = 'I secure all locks', typical_day = 'Morning walk, afternoon play', info_wanted_about_pets = 'Routine and schedule' WHERE id = 1").run();
    const user = db.prepare('SELECT safety_environment, typical_day, info_wanted_about_pets FROM users WHERE id = 1').get() as Record<string, unknown>;
    expect(user.safety_environment).toBe('I secure all locks');
    expect(user.typical_day).toBe('Morning walk, afternoon play');
    expect(user.info_wanted_about_pets).toBe('Routine and schedule');
  });
});
