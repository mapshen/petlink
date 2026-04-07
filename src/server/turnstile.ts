import type { Request, Response, NextFunction } from 'express';

export const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// Brief in-memory cache for recently verified tokens (TTL: 5 minutes)
const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;
const tokenCache = new Map<string, number>();

export function clearTokenCache(): void {
  tokenCache.clear();
}

function isTokenCached(token: string): boolean {
  const expiresAt = tokenCache.get(token);
  if (expiresAt == null) return false;
  if (Date.now() > expiresAt) {
    tokenCache.delete(token);
    return false;
  }
  return true;
}

function cacheToken(token: string): void {
  tokenCache.set(token, Date.now() + TOKEN_CACHE_TTL_MS);

  // Evict expired entries periodically (keep cache bounded)
  if (tokenCache.size > 1000) {
    const now = Date.now();
    for (const [key, exp] of tokenCache) {
      if (now > exp) tokenCache.delete(key);
    }
  }
}

function extractToken(req: Request): string | undefined {
  const headerToken = req.headers['cf-turnstile-response'];
  if (typeof headerToken === 'string' && headerToken.length > 0) {
    return headerToken;
  }
  const bodyToken = req.body?.cf_turnstile_response;
  if (typeof bodyToken === 'string' && bodyToken.length > 0) {
    return bodyToken;
  }
  return undefined;
}

/**
 * Express middleware that verifies a Cloudflare Turnstile CAPTCHA token.
 *
 * - Gracefully skips when TURNSTILE_SECRET_KEY is not configured (dev mode).
 * - Reads token from `cf-turnstile-response` header or `cf_turnstile_response` body field.
 * - Caches recently valid tokens for 5 minutes to reduce API calls.
 * - Fails open on Cloudflare API errors (network issues, 5xx) to avoid blocking legitimate users.
 */
export async function verifyTurnstile(req: Request, res: Response, next: NextFunction): Promise<void> {
  const secretKey = process.env.TURNSTILE_SECRET_KEY;

  // Graceful degradation: skip when not configured
  if (!secretKey) {
    next();
    return;
  }

  const token = extractToken(req);
  if (!token) {
    res.status(403).json({
      error: 'CAPTCHA verification required',
      code: 'TURNSTILE_REQUIRED',
    });
    return;
  }

  // Check cache first
  if (isTokenCached(token)) {
    next();
    return;
  }

  try {
    const formData = new FormData();
    formData.append('secret', secretKey);
    formData.append('response', token);
    if (req.ip) {
      formData.append('remoteip', req.ip);
    }

    const cfResponse = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      body: formData,
    });

    if (!cfResponse.ok) {
      // Fail open on Cloudflare API errors
      next();
      return;
    }

    const result = await cfResponse.json() as { success: boolean; 'error-codes'?: string[] };

    if (result.success) {
      cacheToken(token);
      next();
      return;
    }

    res.status(403).json({
      error: 'CAPTCHA verification failed',
      code: 'TURNSTILE_FAILED',
    });
  } catch {
    // Fail open on network errors to avoid blocking legitimate users
    next();
  }
}
