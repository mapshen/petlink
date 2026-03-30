import { describe, it, expect, afterEach } from 'vitest';
import { isAdminUser, isAdminEmail, hasRole, hasSitterRole } from './admin.ts';

describe('isAdminEmail', () => {
  const originalEnv = process.env.ADMIN_EMAIL;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ADMIN_EMAIL = originalEnv;
    } else {
      delete process.env.ADMIN_EMAIL;
    }
  });

  it('returns false when ADMIN_EMAIL is not set', () => {
    delete process.env.ADMIN_EMAIL;
    expect(isAdminEmail('admin@example.com')).toBe(false);
  });

  it('returns true when email matches ADMIN_EMAIL', () => {
    process.env.ADMIN_EMAIL = 'admin@example.com';
    expect(isAdminEmail('admin@example.com')).toBe(true);
  });

  it('matches case-insensitively', () => {
    process.env.ADMIN_EMAIL = 'Admin@Example.com';
    expect(isAdminEmail('admin@example.com')).toBe(true);
    expect(isAdminEmail('ADMIN@EXAMPLE.COM')).toBe(true);
  });

  it('returns false for non-matching email', () => {
    process.env.ADMIN_EMAIL = 'admin@example.com';
    expect(isAdminEmail('other@example.com')).toBe(false);
  });
});

describe('isAdminUser', () => {
  const originalEnv = process.env.ADMIN_EMAIL;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.ADMIN_EMAIL = originalEnv;
    } else {
      delete process.env.ADMIN_EMAIL;
    }
  });

  it('returns true when email matches AND roles include admin', () => {
    process.env.ADMIN_EMAIL = 'admin@example.com';
    expect(isAdminUser('admin@example.com', ['owner', 'admin'])).toBe(true);
  });

  it('returns false when email matches but roles do not include admin', () => {
    process.env.ADMIN_EMAIL = 'admin@example.com';
    expect(isAdminUser('admin@example.com', ['owner'])).toBe(false);
  });

  it('returns false when roles include admin but email does not match', () => {
    process.env.ADMIN_EMAIL = 'admin@example.com';
    expect(isAdminUser('other@example.com', ['owner', 'admin'])).toBe(false);
  });

  it('returns false when ADMIN_EMAIL is not set', () => {
    delete process.env.ADMIN_EMAIL;
    expect(isAdminUser('admin@example.com', ['owner', 'admin'])).toBe(false);
  });
});

describe('hasRole', () => {
  it('returns true when role is present', () => {
    expect(hasRole(['owner', 'sitter'], 'sitter')).toBe(true);
  });

  it('returns false when role is not present', () => {
    expect(hasRole(['owner'], 'sitter')).toBe(false);
  });
});

describe('hasSitterRole', () => {
  it('returns true for sitter role', () => {
    expect(hasSitterRole(['owner', 'sitter'])).toBe(true);
  });

  it('returns false without sitter role', () => {
    expect(hasSitterRole(['owner'])).toBe(false);
  });
});
