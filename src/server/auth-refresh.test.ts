import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock db module before imports
const { mockSqlFn } = vi.hoisted(() => ({ mockSqlFn: vi.fn() }));
vi.mock('./db.ts', () => ({ default: mockSqlFn }));

import {
  generateRefreshToken,
  hashRefreshToken,
  createRefreshToken,
  validateRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
} from './auth.ts';

describe('refresh token utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateRefreshToken', () => {
    it('returns a 64-char hex string', () => {
      const token = generateRefreshToken();
      expect(token).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(token)).toBe(true);
    });

    it('produces unique tokens on each call', () => {
      const token1 = generateRefreshToken();
      const token2 = generateRefreshToken();
      expect(token1).not.toBe(token2);
    });
  });

  describe('hashRefreshToken', () => {
    it('produces a consistent SHA-256 hash', () => {
      const token = 'a'.repeat(64);
      const hash1 = hashRefreshToken(token);
      const hash2 = hashRefreshToken(token);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it('produces different hashes for different tokens', () => {
      const hash1 = hashRefreshToken('a'.repeat(64));
      const hash2 = hashRefreshToken('b'.repeat(64));
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('createRefreshToken', () => {
    it('stores hashed token in DB and returns raw token', async () => {
      mockSqlFn.mockResolvedValueOnce([] as any);

      const token = await createRefreshToken(42);

      expect(token).toHaveLength(64);
      expect(mockSqlFn).toHaveBeenCalledTimes(1);

      // Tagged template: sql`INSERT ... VALUES (${userId}, ${tokenHash}, ${expiresAt})`
      // mockSqlFn receives (strings[], userId, tokenHash, expiresAt)
      const callArgs = mockSqlFn.mock.calls[0];
      expect(callArgs[1]).toBe(42); // userId
      expect(callArgs[2]).toBe(hashRefreshToken(token)); // tokenHash
      expect(callArgs[3]).toBeInstanceOf(Date); // expiresAt
    });

    it('sets expiry ~30 days in the future', async () => {
      mockSqlFn.mockResolvedValueOnce([] as any);

      const before = Date.now();
      await createRefreshToken(99);
      const after = Date.now();

      const expiresAt = mockSqlFn.mock.calls[0][3] as Date;
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + thirtyDaysMs);
      expect(expiresAt.getTime()).toBeLessThanOrEqual(after + thirtyDaysMs);
    });
  });

  describe('validateRefreshToken', () => {
    it('returns userId for a valid token', async () => {
      const token = generateRefreshToken();
      const hash = hashRefreshToken(token);

      mockSqlFn.mockResolvedValueOnce([{
        user_id: 42,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        revoked_at: null,
      }] as any);

      const result = await validateRefreshToken(token);

      expect(result).toBe(42);
      // Verify the hash was used for lookup
      expect(mockSqlFn.mock.calls[0][1]).toBe(hash);
    });

    it('returns null for non-existent token', async () => {
      mockSqlFn.mockResolvedValueOnce([] as any);

      const result = await validateRefreshToken('nonexistent');
      expect(result).toBeNull();
    });

    it('returns null for revoked token', async () => {
      mockSqlFn.mockResolvedValueOnce([{
        user_id: 42,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        revoked_at: new Date().toISOString(),
      }] as any);

      const result = await validateRefreshToken('some-token');
      expect(result).toBeNull();
    });

    it('returns null for expired token', async () => {
      mockSqlFn.mockResolvedValueOnce([{
        user_id: 42,
        expires_at: new Date(Date.now() - 1000).toISOString(),
        revoked_at: null,
      }] as any);

      const result = await validateRefreshToken('some-token');
      expect(result).toBeNull();
    });
  });

  describe('revokeRefreshToken', () => {
    it('updates revoked_at for the token hash', async () => {
      mockSqlFn.mockResolvedValueOnce([] as any);
      const token = generateRefreshToken();

      await revokeRefreshToken(token);

      expect(mockSqlFn).toHaveBeenCalledTimes(1);
      expect(mockSqlFn.mock.calls[0][1]).toBe(hashRefreshToken(token));
    });
  });

  describe('revokeAllUserTokens', () => {
    it('revokes all tokens for a user', async () => {
      mockSqlFn.mockResolvedValueOnce([] as any);

      await revokeAllUserTokens(42);

      expect(mockSqlFn).toHaveBeenCalledTimes(1);
      expect(mockSqlFn.mock.calls[0][1]).toBe(42);
    });
  });

  describe('token rotation flow', () => {
    it('old token becomes invalid after revocation', async () => {
      const oldToken = generateRefreshToken();

      // First call: validate old token (valid)
      mockSqlFn.mockResolvedValueOnce([{
        user_id: 42,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        revoked_at: null,
      }] as any);

      const userId = await validateRefreshToken(oldToken);
      expect(userId).toBe(42);

      // Revoke old token
      mockSqlFn.mockResolvedValueOnce([] as any);
      await revokeRefreshToken(oldToken);

      // Second call: validate old token (now revoked)
      mockSqlFn.mockResolvedValueOnce([{
        user_id: 42,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        revoked_at: new Date().toISOString(),
      }] as any);

      const result = await validateRefreshToken(oldToken);
      expect(result).toBeNull();
    });
  });
});
