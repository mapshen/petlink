import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import sql from './db.ts';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET environment variable is required in production');
}
// Use random ephemeral secret in dev — tokens don't persist across restarts
const resolvedSecret = JWT_SECRET || crypto.randomBytes(32).toString('hex');
const SALT_ROUNDS = 10;
const TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_DAYS = 30;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: { userId: number }): string {
  return jwt.sign(payload, resolvedSecret, { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): { userId: number } {
  return jwt.verify(token, resolvedSecret) as { userId: number };
}

export interface AuthenticatedRequest extends Request {
  userId?: number;
}

// --- Refresh token utilities ---

export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createRefreshToken(userId: number): Promise<string> {
  const token = generateRefreshToken();
  const tokenHash = hashRefreshToken(token);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  await sql`
    INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
    VALUES (${userId}, ${tokenHash}, ${expiresAt})
  `;
  return token;
}

export async function validateRefreshToken(token: string): Promise<number | null> {
  const tokenHash = hashRefreshToken(token);
  const [row] = await sql`
    SELECT user_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = ${tokenHash}
  `;
  if (!row) return null;
  if (row.revoked_at) return null;
  if (new Date(row.expires_at) <= new Date()) return null;
  return row.user_id;
}

export async function revokeRefreshToken(token: string): Promise<void> {
  const tokenHash = hashRefreshToken(token);
  await sql`
    UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ${tokenHash}
  `;
}

export async function revokeAllUserTokens(userId: number): Promise<void> {
  await sql`
    UPDATE refresh_tokens SET revoked_at = NOW()
    WHERE user_id = ${userId} AND revoked_at IS NULL
  `;
}

export async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const decoded = verifyToken(token);
    const [user] = await sql`SELECT id, approval_status, deleted_at FROM users WHERE id = ${decoded.userId}`;
    if (!user || user.deleted_at) {
      res.status(401).json({ error: 'User not found' });
      return;
    }
    if (user.approval_status === 'banned') {
      // Check if suspension has expired before blocking
      const { checkSuspensionExpiry } = await import('./ban-actions.ts');
      const restored = await checkSuspensionExpiry(decoded.userId);
      if (!restored) {
        res.status(403).json({ error: 'Your account has been suspended. Please contact support.' });
        return;
      }
    }
    req.userId = decoded.userId;

    // Track last activity for dormancy detection (throttled: once per day)
    // Also resets dormancy_warning_sent_at so reactivated users get fresh warnings if they go dormant again
    sql`
      UPDATE users SET last_active_at = NOW(), dormancy_warning_sent_at = NULL
      WHERE id = ${decoded.userId}
        AND (last_active_at IS NULL OR last_active_at < NOW() - INTERVAL '1 day')
    `.catch(() => {});

    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
