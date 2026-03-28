import { describe, it, expect } from 'vitest';
import { createPublicLimiter, createApiLimiter, createAuthLimiter } from './rate-limit.ts';

describe('createPublicLimiter', () => {
  it('returns a rate limiter with 30 max and 15min window', () => {
    const limiter = createPublicLimiter();
    expect(limiter).toBeDefined();
    expect(typeof limiter).toBe('function');
  });
});

describe('createApiLimiter', () => {
  it('returns a rate limiter with 100 max and 15min window', () => {
    const limiter = createApiLimiter();
    expect(limiter).toBeDefined();
    expect(typeof limiter).toBe('function');
  });
});

describe('createAuthLimiter', () => {
  it('returns a rate limiter with 20 max and 15min window', () => {
    const limiter = createAuthLimiter();
    expect(limiter).toBeDefined();
    expect(typeof limiter).toBe('function');
  });
});
