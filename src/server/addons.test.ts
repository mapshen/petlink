import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { ADDON_SLUGS } from '../shared/addon-catalog';
import { sitterAddonSchema } from './validation';

describe('sitter add-ons management', () => {
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
        roles TEXT DEFAULT 'owner',
        approval_status TEXT DEFAULT 'approved'
      );
      CREATE TABLE sitter_addons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sitter_id INTEGER NOT NULL,
        addon_slug TEXT NOT NULL,
        price_cents INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(sitter_id, addon_slug),
        FOREIGN KEY (sitter_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sitter_id INTEGER NOT NULL,
        owner_id INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        total_price_cents INTEGER,
        FOREIGN KEY (sitter_id) REFERENCES users(id),
        FOREIGN KEY (owner_id) REFERENCES users(id)
      );
      CREATE TABLE booking_addons (
        booking_id INTEGER NOT NULL,
        addon_id INTEGER,
        addon_slug TEXT NOT NULL,
        price_cents INTEGER NOT NULL,
        PRIMARY KEY (booking_id, addon_slug),
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
        FOREIGN KEY (addon_id) REFERENCES sitter_addons(id) ON DELETE SET NULL
      );
    `);

    // Sitter (id=1)
    testDb.prepare("INSERT INTO users (email, password_hash, name, roles) VALUES ('sitter@test.com', 'hash', 'Sitter', 'owner,sitter')").run();
    // Owner (id=2)
    testDb.prepare("INSERT INTO users (email, password_hash, name, roles) VALUES ('owner@test.com', 'hash', 'Owner', 'owner')").run();
    // Another sitter (id=3)
    testDb.prepare("INSERT INTO users (email, password_hash, name, roles) VALUES ('sitter2@test.com', 'hash', 'Sitter2', 'owner,sitter')").run();
  });

  afterAll(() => {
    testDb.close();
  });

  // --- Sitter Add-on CRUD ---

  it('sitter can enable an add-on', () => {
    const info = testDb.prepare(
      "INSERT INTO sitter_addons (sitter_id, addon_slug, price_cents, notes) VALUES (1, 'medication_admin', 500, 'Insulin injections OK')"
    ).run();
    expect(info.changes).toBe(1);

    const addon = testDb.prepare('SELECT * FROM sitter_addons WHERE id = 1').get() as any;
    expect(addon.sitter_id).toBe(1);
    expect(addon.addon_slug).toBe('medication_admin');
    expect(addon.price_cents).toBe(500);
    expect(addon.notes).toBe('Insulin injections OK');
  });

  it('prevents duplicate slug for same sitter', () => {
    expect(() => {
      testDb.prepare(
        "INSERT INTO sitter_addons (sitter_id, addon_slug, price_cents) VALUES (1, 'medication_admin', 1000)"
      ).run();
    }).toThrow();
  });

  it('allows same slug for different sitters', () => {
    const info = testDb.prepare(
      "INSERT INTO sitter_addons (sitter_id, addon_slug, price_cents) VALUES (3, 'medication_admin', 800)"
    ).run();
    expect(info.changes).toBe(1);
  });

  it('sitter can update add-on price and notes', () => {
    testDb.prepare(
      'UPDATE sitter_addons SET price_cents = 750, notes = NULL WHERE id = 1 AND sitter_id = 1'
    ).run();
    const addon = testDb.prepare('SELECT * FROM sitter_addons WHERE id = 1').get() as any;
    expect(addon.price_cents).toBe(750);
    expect(addon.notes).toBeNull();
  });

  it('sitter can enable multiple add-ons', () => {
    testDb.prepare("INSERT INTO sitter_addons (sitter_id, addon_slug, price_cents) VALUES (1, 'bathing', 1500)").run();
    testDb.prepare("INSERT INTO sitter_addons (sitter_id, addon_slug, price_cents) VALUES (1, 'pickup_dropoff', 1500)").run();
    testDb.prepare("INSERT INTO sitter_addons (sitter_id, addon_slug, price_cents, notes) VALUES (1, 'daily_updates', 0, NULL)").run();

    const addons = testDb.prepare('SELECT * FROM sitter_addons WHERE sitter_id = 1 ORDER BY created_at').all() as any[];
    expect(addons).toHaveLength(4);
  });

  it('sitter can delete an add-on', () => {
    const info = testDb.prepare('DELETE FROM sitter_addons WHERE id = 1 AND sitter_id = 1').run();
    expect(info.changes).toBe(1);

    const remaining = testDb.prepare('SELECT * FROM sitter_addons WHERE sitter_id = 1').all() as any[];
    expect(remaining).toHaveLength(3);
  });

  it('cannot delete another sitter add-on', () => {
    const info = testDb.prepare('DELETE FROM sitter_addons WHERE id = 2 AND sitter_id = 1').run();
    expect(info.changes).toBe(0);
  });

  // --- Booking Add-ons ---

  it('booking can include selected add-ons with price snapshot', () => {
    // Create a booking
    testDb.prepare(
      "INSERT INTO bookings (sitter_id, owner_id, start_time, end_time, total_price_cents) VALUES (1, 2, '2026-04-10T10:00:00Z', '2026-04-10T11:00:00Z', 4500)"
    ).run();

    // Snapshot add-ons at booking time
    const addonRows = testDb.prepare('SELECT id, addon_slug, price_cents FROM sitter_addons WHERE sitter_id = 1').all() as any[];
    for (const addon of addonRows) {
      testDb.prepare(
        'INSERT INTO booking_addons (booking_id, addon_id, addon_slug, price_cents) VALUES (1, ?, ?, ?)'
      ).run(addon.id, addon.addon_slug, addon.price_cents);
    }

    const bookingAddons = testDb.prepare('SELECT * FROM booking_addons WHERE booking_id = 1').all() as any[];
    expect(bookingAddons).toHaveLength(3);
    expect(bookingAddons.map((a: any) => a.addon_slug).sort()).toEqual(['bathing', 'daily_updates', 'pickup_dropoff']);
  });

  it('booking addon prices are immutable snapshots', () => {
    // Update sitter's price
    testDb.prepare('UPDATE sitter_addons SET price_cents = 9999 WHERE addon_slug = ?').run('bathing');

    // Booking addon price should remain unchanged
    const [bookingAddon] = testDb.prepare(
      "SELECT price_cents FROM booking_addons WHERE booking_id = 1 AND addon_slug = 'bathing'"
    ).all() as any[];
    expect(bookingAddon.price_cents).toBe(1500); // Original price at booking time
  });

  it('prevents duplicate add-on slug per booking', () => {
    expect(() => {
      testDb.prepare(
        "INSERT INTO booking_addons (booking_id, addon_id, addon_slug, price_cents) VALUES (1, NULL, 'bathing', 1500)"
      ).run();
    }).toThrow();
  });

  it('deleting sitter addon sets booking addon_id to NULL', () => {
    // Get addon_id before delete
    const [before] = testDb.prepare(
      "SELECT addon_id FROM booking_addons WHERE booking_id = 1 AND addon_slug = 'bathing'"
    ).all() as any[];
    expect(before.addon_id).not.toBeNull();

    // Delete the sitter addon
    testDb.prepare("DELETE FROM sitter_addons WHERE addon_slug = 'bathing' AND sitter_id = 1").run();

    // booking addon_id should now be NULL
    const [after] = testDb.prepare(
      "SELECT addon_id, addon_slug, price_cents FROM booking_addons WHERE booking_id = 1 AND addon_slug = 'bathing'"
    ).all() as any[];
    expect(after.addon_id).toBeNull();
    expect(after.addon_slug).toBe('bathing');
    expect(after.price_cents).toBe(1500); // Price snapshot preserved
  });

  it('deleting booking cascades to booking_addons', () => {
    testDb.prepare('DELETE FROM bookings WHERE id = 1').run();
    const addons = testDb.prepare('SELECT * FROM booking_addons WHERE booking_id = 1').all();
    expect(addons).toHaveLength(0);
  });

  it('deleting user cascades to sitter_addons', () => {
    const before = testDb.prepare('SELECT * FROM sitter_addons WHERE sitter_id = 3').all();
    expect(before).toHaveLength(1);

    testDb.prepare('DELETE FROM users WHERE id = 3').run();

    const after = testDb.prepare('SELECT * FROM sitter_addons WHERE sitter_id = 3').all();
    expect(after).toHaveLength(0);
  });
});

describe('addon catalog validation', () => {
  it('validates addon_slug against catalog', () => {

    // Valid slug
    const validResult = sitterAddonSchema.safeParse({
      addon_slug: ADDON_SLUGS[0],
      price_cents: 500,
    });
    expect(validResult.success).toBe(true);

    // Invalid slug
    const invalidResult = sitterAddonSchema.safeParse({
      addon_slug: 'nonexistent_addon',
      price_cents: 500,
    });
    expect(invalidResult.success).toBe(false);
  });

  it('validates price_cents bounds', () => {

    // Negative price
    const negResult = sitterAddonSchema.safeParse({
      addon_slug: 'medication_admin',
      price_cents: -100,
    });
    expect(negResult.success).toBe(false);

    // Over max
    const overResult = sitterAddonSchema.safeParse({
      addon_slug: 'medication_admin',
      price_cents: 60000,
    });
    expect(overResult.success).toBe(false);

    // Zero is valid
    const zeroResult = sitterAddonSchema.safeParse({
      addon_slug: 'daily_updates',
      price_cents: 0,
    });
    expect(zeroResult.success).toBe(true);
  });
});
