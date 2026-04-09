import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      roles TEXT DEFAULT 'owner'
    );
    CREATE TABLE pets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      slug TEXT UNIQUE,
      species TEXT DEFAULT 'dog',
      breed TEXT,
      age INTEGER,
      weight REAL,
      gender TEXT,
      photo_url TEXT,
      special_needs TEXT,
      microchip_number TEXT,
      vet_name TEXT,
      vet_phone TEXT,
      emergency_contact_name TEXT,
      emergency_contact_phone TEXT,
      medical_history TEXT
    );
  `);

  db.prepare("INSERT INTO users (email, password_hash, name) VALUES ('owner@test.com', 'hash', 'Jessica R')").run();
  db.prepare("INSERT INTO users (email, password_hash, name) VALUES ('owner2@test.com', 'hash', 'Tom K')").run();
  return db;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function generateSlug(db: ReturnType<typeof Database>, name: string, excludeId?: number): string {
  const base = slugify(name);
  if (!base) return `pet-${Math.random().toString(16).slice(2, 6)}`;

  const existing = excludeId
    ? db.prepare('SELECT id FROM pets WHERE slug = ? AND id != ? LIMIT 1').get(base, excludeId)
    : db.prepare('SELECT id FROM pets WHERE slug = ? LIMIT 1').get(base);

  if (!existing) return base;

  // Increment suffix
  for (let i = 2; i < 100; i++) {
    const candidate = `${base}-${i}`;
    const dup = db.prepare('SELECT id FROM pets WHERE slug = ? LIMIT 1').get(candidate);
    if (!dup) return candidate;
  }

  return `${base}-${Date.now()}`;
}

describe('pet slug infrastructure', () => {
  let db: ReturnType<typeof Database>;

  beforeEach(() => {
    db = createTestDb();
  });

  describe('slug generation', () => {
    it('generates slug from pet name', () => {
      expect(slugify('Barkley')).toBe('barkley');
    });

    it('handles multi-word pet names', () => {
      expect(slugify('Sir Barks A Lot')).toBe('sir-barks-a-lot');
    });

    it('does not include owner info in slug', () => {
      const slug = generateSlug(db, 'Barkley');
      expect(slug).toBe('barkley');
      expect(slug).not.toContain('jessica');
    });

    it('appends numeric suffix for duplicate names', () => {
      db.prepare("INSERT INTO pets (owner_id, name, slug) VALUES (1, 'Barkley', 'barkley')").run();
      const slug = generateSlug(db, 'Barkley');
      expect(slug).toBe('barkley-2');
    });

    it('increments suffix for multiple duplicates', () => {
      db.prepare("INSERT INTO pets (owner_id, name, slug) VALUES (1, 'Barkley', 'barkley')").run();
      db.prepare("INSERT INTO pets (owner_id, name, slug) VALUES (2, 'Barkley', 'barkley-2')").run();
      const slug = generateSlug(db, 'Barkley');
      expect(slug).toBe('barkley-3');
    });

    it('excludes own id when checking collisions', () => {
      const { lastInsertRowid } = db.prepare("INSERT INTO pets (owner_id, name, slug) VALUES (1, 'Barkley', 'barkley')").run();
      const slug = generateSlug(db, 'Barkley', Number(lastInsertRowid));
      expect(slug).toBe('barkley');
    });
  });

  describe('pet creation with slug', () => {
    it('stores slug on pet insert', () => {
      const slug = generateSlug(db, 'Luna');
      db.prepare("INSERT INTO pets (owner_id, name, slug) VALUES (1, 'Luna', ?)").run(slug);

      const pet = db.prepare('SELECT * FROM pets WHERE slug = ?').get('luna') as { name: string; slug: string };
      expect(pet).toBeDefined();
      expect(pet.name).toBe('Luna');
      expect(pet.slug).toBe('luna');
    });

    it('slug is globally unique across owners', () => {
      const slug1 = generateSlug(db, 'Barkley');
      db.prepare("INSERT INTO pets (owner_id, name, slug) VALUES (1, 'Barkley', ?)").run(slug1);

      const slug2 = generateSlug(db, 'Barkley');
      db.prepare("INSERT INTO pets (owner_id, name, slug) VALUES (2, 'Barkley', ?)").run(slug2);

      expect(slug1).toBe('barkley');
      expect(slug2).toBe('barkley-2');

      const pets = db.prepare('SELECT slug FROM pets ORDER BY id').all() as { slug: string }[];
      expect(pets.map(p => p.slug)).toEqual(['barkley', 'barkley-2']);
    });

    it('enforces unique constraint on slug column', () => {
      db.prepare("INSERT INTO pets (owner_id, name, slug) VALUES (1, 'A', 'barkley')").run();
      expect(() => {
        db.prepare("INSERT INTO pets (owner_id, name, slug) VALUES (2, 'B', 'barkley')").run();
      }).toThrow(/UNIQUE constraint failed/);
    });

    it('slug does not change on pet update', () => {
      db.prepare("INSERT INTO pets (owner_id, name, slug) VALUES (1, 'Barkley', 'barkley')").run();
      // Update name but not slug
      db.prepare("UPDATE pets SET name = 'Barkley Jr.' WHERE slug = 'barkley'").run();

      const pet = db.prepare('SELECT * FROM pets WHERE slug = ?').get('barkley') as { name: string; slug: string };
      expect(pet.name).toBe('Barkley Jr.');
      expect(pet.slug).toBe('barkley');
    });
  });

  describe('public pet profile by slug', () => {
    it('can look up pet by slug', () => {
      db.prepare("INSERT INTO pets (owner_id, name, slug, species, breed) VALUES (1, 'Barkley', 'barkley', 'dog', 'Golden Retriever')").run();

      const pet = db.prepare('SELECT id, name, slug, species, breed, photo_url FROM pets WHERE slug = ?').get('barkley') as { name: string };
      expect(pet).toBeDefined();
      expect(pet.name).toBe('Barkley');
    });

    it('returns null for non-existent slug', () => {
      const pet = db.prepare('SELECT * FROM pets WHERE slug = ?').get('nonexistent');
      expect(pet).toBeUndefined();
    });

    it('public query excludes private fields', () => {
      db.prepare("INSERT INTO pets (owner_id, name, slug, species, vet_name, vet_phone, emergency_contact_name, emergency_contact_phone, medical_history, microchip_number) VALUES (1, 'Barkley', 'barkley', 'dog', 'Dr. Wilson', '555-1234', 'Mike R.', '555-5678', 'Allergic to chicken', '985112003')").run();

      // Public query: explicit allowlist of safe fields
      const publicPet = db.prepare('SELECT id, name, slug, species, breed, age, weight, gender, photo_url FROM pets WHERE slug = ?').get('barkley') as Record<string, unknown>;

      expect(publicPet.name).toBe('Barkley');
      expect(publicPet).not.toHaveProperty('vet_name');
      expect(publicPet).not.toHaveProperty('vet_phone');
      expect(publicPet).not.toHaveProperty('emergency_contact_name');
      expect(publicPet).not.toHaveProperty('emergency_contact_phone');
      expect(publicPet).not.toHaveProperty('medical_history');
      expect(publicPet).not.toHaveProperty('microchip_number');
    });
  });

  describe('owner profile by slug', () => {
    it('can look up owner with their pets', () => {
      db.prepare("INSERT INTO pets (owner_id, name, slug, species) VALUES (1, 'Barkley', 'barkley', 'dog')").run();
      db.prepare("INSERT INTO pets (owner_id, name, slug, species) VALUES (1, 'Luna', 'luna', 'dog')").run();

      const owner = db.prepare('SELECT id, name FROM users WHERE id = ?').get(1) as { id: number; name: string };
      const pets = db.prepare('SELECT id, name, slug, species, breed, photo_url FROM pets WHERE owner_id = ?').all(owner.id) as { slug: string }[];

      expect(owner.name).toBe('Jessica R');
      expect(pets).toHaveLength(2);
      expect(pets.map(p => p.slug)).toEqual(['barkley', 'luna']);
    });
  });
});
