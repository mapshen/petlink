import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// Mock global fetch before importing the module
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { verifyTurnstile, TURNSTILE_VERIFY_URL, clearTokenCache } from './turnstile.ts';

function createMockReq(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    headers: {},
    body: {},
    ip: '127.0.0.1',
    ...overrides,
  };
}

function createMockRes(): Partial<Response> {
  return {
    status: vi.fn().mockReturnThis() as any,
    json: vi.fn().mockReturnThis() as any,
  };
}

describe('verifyTurnstile middleware', () => {
  const originalEnv = { ...process.env };
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = createMockReq();
    mockRes = createMockRes();
    mockNext = vi.fn();
    mockFetch.mockReset();
    clearTokenCache();
  });

  afterEach(() => {
    process.env.TURNSTILE_SITE_KEY = originalEnv.TURNSTILE_SITE_KEY;
    process.env.TURNSTILE_SECRET_KEY = originalEnv.TURNSTILE_SECRET_KEY;
  });

  describe('graceful degradation (env vars not set)', () => {
    it('skips verification when TURNSTILE_SECRET_KEY is not set', () => {
      delete process.env.TURNSTILE_SITE_KEY;
      delete process.env.TURNSTILE_SECRET_KEY;

      verifyTurnstile(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('skips verification when TURNSTILE_SECRET_KEY is empty string', () => {
      process.env.TURNSTILE_SITE_KEY = '';
      process.env.TURNSTILE_SECRET_KEY = '';

      verifyTurnstile(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('authenticated user bypass', () => {
    beforeEach(() => {
      process.env.TURNSTILE_SITE_KEY = 'test-site-key';
      process.env.TURNSTILE_SECRET_KEY = 'test-secret-key';
    });

    it('skips verification for requests with Bearer auth token', async () => {
      mockReq.headers = { authorization: 'Bearer some-jwt-token' };

      await verifyTurnstile(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('does not skip for non-Bearer auth headers', async () => {
      mockReq.headers = { authorization: 'Basic dXNlcjpwYXNz' };

      await verifyTurnstile(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('token extraction', () => {
    beforeEach(() => {
      process.env.TURNSTILE_SITE_KEY = 'test-site-key';
      process.env.TURNSTILE_SECRET_KEY = 'test-secret-key';
    });

    it('rejects requests without a turnstile token', async () => {
      await verifyTurnstile(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'CAPTCHA verification required',
        code: 'TURNSTILE_REQUIRED',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('reads token from cf-turnstile-response header', async () => {
      mockReq.headers = { 'cf-turnstile-response': 'valid-token' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await verifyTurnstile(mockReq as Request, mockRes as Response, mockNext);

      expect(mockFetch).toHaveBeenCalledWith(
        TURNSTILE_VERIFY_URL,
        expect.objectContaining({
          method: 'POST',
        }),
      );
      expect(mockNext).toHaveBeenCalled();
    });

    it('reads token from body cf_turnstile_response', async () => {
      mockReq.body = { cf_turnstile_response: 'body-token' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await verifyTurnstile(mockReq as Request, mockRes as Response, mockNext);

      expect(mockFetch).toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('prefers header token over body token', async () => {
      mockReq.headers = { 'cf-turnstile-response': 'header-token' };
      mockReq.body = { cf_turnstile_response: 'body-token' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await verifyTurnstile(mockReq as Request, mockRes as Response, mockNext);

      const fetchBody = mockFetch.mock.calls[0][1].body as FormData;
      expect(fetchBody.get('response')).toBe('header-token');
    });
  });

  describe('Cloudflare API verification', () => {
    beforeEach(() => {
      process.env.TURNSTILE_SITE_KEY = 'test-site-key';
      process.env.TURNSTILE_SECRET_KEY = 'test-secret-key';
    });

    it('sends correct payload to Cloudflare siteverify', async () => {
      mockReq = createMockReq({ headers: { 'cf-turnstile-response': 'test-token' }, ip: '192.168.1.1' as any });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await verifyTurnstile(mockReq as Request, mockRes as Response, mockNext);

      expect(mockFetch).toHaveBeenCalledWith(TURNSTILE_VERIFY_URL, {
        method: 'POST',
        body: expect.any(FormData),
      });

      const fetchBody = mockFetch.mock.calls[0][1].body as FormData;
      expect(fetchBody.get('secret')).toBe('test-secret-key');
      expect(fetchBody.get('response')).toBe('test-token');
      expect(fetchBody.get('remoteip')).toBe('192.168.1.1');
    });

    it('calls next() on successful verification', async () => {
      mockReq.headers = { 'cf-turnstile-response': 'valid-token' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      await verifyTurnstile(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('rejects with 403 on failed verification', async () => {
      mockReq.headers = { 'cf-turnstile-response': 'bad-token' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] }),
      });

      await verifyTurnstile(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'CAPTCHA verification failed',
        code: 'TURNSTILE_FAILED',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('handles Cloudflare API network errors gracefully', async () => {
      mockReq.headers = { 'cf-turnstile-response': 'valid-token' };
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await verifyTurnstile(mockReq as Request, mockRes as Response, mockNext);

      // Fail open on network errors to avoid blocking legitimate users
      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('handles non-ok HTTP responses from Cloudflare gracefully', async () => {
      mockReq.headers = { 'cf-turnstile-response': 'valid-token' };
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({}),
      });

      await verifyTurnstile(mockReq as Request, mockRes as Response, mockNext);

      // Fail open on Cloudflare errors
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('token caching', () => {
    beforeEach(() => {
      process.env.TURNSTILE_SITE_KEY = 'test-site-key';
      process.env.TURNSTILE_SECRET_KEY = 'test-secret-key';
    });

    it('caches valid tokens and skips re-verification', async () => {
      mockReq.headers = { 'cf-turnstile-response': 'cached-token' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      // First call — verifies with Cloudflare
      await verifyTurnstile(mockReq as Request, mockRes as Response, mockNext);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockNext).toHaveBeenCalledTimes(1);

      // Second call with same token — should use cache
      mockNext = vi.fn();
      await verifyTurnstile(mockReq as Request, mockRes as Response, mockNext);
      expect(mockFetch).toHaveBeenCalledTimes(1); // no additional fetch
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('does not cache failed tokens', async () => {
      mockReq.headers = { 'cf-turnstile-response': 'bad-token' };
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] }),
      });

      await verifyTurnstile(mockReq as Request, mockRes as Response, mockNext);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockNext).not.toHaveBeenCalled();

      // Second call with same bad token — should re-verify
      mockRes = createMockRes();
      mockNext = vi.fn();
      await verifyTurnstile(mockReq as Request, mockRes as Response, mockNext);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('clearTokenCache removes all cached entries', async () => {
      mockReq.headers = { 'cf-turnstile-response': 'will-be-cleared' };
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });

      await verifyTurnstile(mockReq as Request, mockRes as Response, mockNext);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      clearTokenCache();

      // After clearing, should re-verify
      mockNext = vi.fn();
      await verifyTurnstile(mockReq as Request, mockRes as Response, mockNext);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
