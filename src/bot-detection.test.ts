import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isBotUserAgent, botBlockMiddleware, KNOWN_BOT_PATTERNS } from './bot-detection.ts';
import type { Request, Response, NextFunction } from 'express';

describe('KNOWN_BOT_PATTERNS', () => {
  it('contains patterns for common scrapers', () => {
    expect(KNOWN_BOT_PATTERNS.length).toBeGreaterThanOrEqual(13);
  });
});

describe('isBotUserAgent', () => {
  it('detects python-requests', () => {
    expect(isBotUserAgent('python-requests/2.28.0')).toBe(true);
  });

  it('detects Scrapy', () => {
    expect(isBotUserAgent('Scrapy/2.7.1')).toBe(true);
  });

  it('detects curl', () => {
    expect(isBotUserAgent('curl/7.68.0')).toBe(true);
  });

  it('detects wget', () => {
    expect(isBotUserAgent('Wget/1.21')).toBe(true);
  });

  it('detects go-http-client', () => {
    expect(isBotUserAgent('Go-http-client/1.1')).toBe(true);
  });

  it('detects PhantomJS', () => {
    expect(isBotUserAgent('Mozilla/5.0 PhantomJS/2.1.1')).toBe(true);
  });

  it('detects selenium', () => {
    expect(isBotUserAgent('selenium/4.0')).toBe(true);
  });

  it('detects puppeteer', () => {
    expect(isBotUserAgent('puppeteer/19.0')).toBe(true);
  });

  it('is case insensitive', () => {
    expect(isBotUserAgent('PYTHON-REQUESTS/2.28.0')).toBe(true);
    expect(isBotUserAgent('SCRAPY/2.7')).toBe(true);
    expect(isBotUserAgent('CURL/7.68')).toBe(true);
  });

  it('allows Chrome browser', () => {
    expect(isBotUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36')).toBe(false);
  });

  it('allows Firefox browser', () => {
    expect(isBotUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0')).toBe(false);
  });

  it('allows Safari browser', () => {
    expect(isBotUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 Version/17.2 Safari/605.1.15')).toBe(false);
  });

  it('allows Mobile Safari', () => {
    expect(isBotUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isBotUserAgent('')).toBe(false);
  });
});

describe('botBlockMiddleware', () => {
  const originalEnv = process.env.NODE_ENV;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockReq = { headers: {} };
    mockRes = {
      status: vi.fn().mockReturnThis() as any,
      json: vi.fn().mockReturnThis() as any,
    };
    mockNext = vi.fn();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('skips in development mode', () => {
    process.env.NODE_ENV = 'development';
    mockReq.headers = { 'user-agent': 'python-requests/2.28.0' };

    botBlockMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it('allows missing user-agent in production', () => {
    process.env.NODE_ENV = 'production';
    mockReq.headers = {};

    botBlockMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });

  it('allows empty user-agent in production', () => {
    process.env.NODE_ENV = 'production';
    mockReq.headers = { 'user-agent': '' };

    botBlockMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });

  it('blocks bot user-agents in production', () => {
    process.env.NODE_ENV = 'production';
    mockReq.headers = { 'user-agent': 'python-requests/2.28.0' };

    botBlockMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(403);
    expect(mockRes.json).toHaveBeenCalledWith({ error: 'Automated access not permitted' });
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('allows normal browsers in production', () => {
    process.env.NODE_ENV = 'production';
    mockReq.headers = { 'user-agent': 'Mozilla/5.0 Chrome/120.0.0.0' };

    botBlockMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });
});
