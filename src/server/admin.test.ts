import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isAdminUser } from './admin.ts';

describe('isAdminUser', () => {
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
    expect(isAdminUser('admin@example.com')).toBe(false);
  });

  it('returns true when email matches ADMIN_EMAIL', () => {
    process.env.ADMIN_EMAIL = 'admin@example.com';
    expect(isAdminUser('admin@example.com')).toBe(true);
  });

  it('matches case-insensitively', () => {
    process.env.ADMIN_EMAIL = 'Admin@Example.com';
    expect(isAdminUser('admin@example.com')).toBe(true);
    expect(isAdminUser('ADMIN@EXAMPLE.COM')).toBe(true);
  });

  it('returns false for non-matching email', () => {
    process.env.ADMIN_EMAIL = 'admin@example.com';
    expect(isAdminUser('other@example.com')).toBe(false);
  });

  it('returns false for empty string', () => {
    process.env.ADMIN_EMAIL = 'admin@example.com';
    expect(isAdminUser('')).toBe(false);
  });
});
