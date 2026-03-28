import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, signToken, verifyToken } from './auth.ts';

describe('auth utilities', () => {
  describe('hashPassword / verifyPassword', () => {
    it('should hash a password and verify it', () => {
      const password = 'test-password-123';
      const hash = hashPassword(password);

      expect(hash).not.toBe(password);
      expect(verifyPassword(password, hash)).toBe(true);
    });

    it('should reject wrong password', () => {
      const hash = hashPassword('correct-password');
      expect(verifyPassword('wrong-password', hash)).toBe(false);
    });

    it('should produce different hashes for same password', () => {
      const password = 'same-password';
      const hash1 = hashPassword(password);
      const hash2 = hashPassword(password);
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('signToken / verifyToken', () => {
    it('should sign and verify a token', () => {
      const payload = { userId: 42 };
      const token = signToken(payload);
      const decoded = verifyToken(token);

      expect(decoded.userId).toBe(42);
    });

    it('should reject tampered tokens', () => {
      const token = signToken({ userId: 1 });
      const tampered = token.slice(0, -5) + 'XXXXX';

      expect(() => verifyToken(tampered)).toThrow();
    });

    it('should reject garbage strings', () => {
      expect(() => verifyToken('not-a-token')).toThrow();
    });
  });
});
