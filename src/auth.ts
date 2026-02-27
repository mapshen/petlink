import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import sql from './db.ts';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET environment variable is required in production');
}
const resolvedSecret = JWT_SECRET || 'petlink-dev-secret-change-in-production';
const SALT_ROUNDS = 10;
const TOKEN_EXPIRY = '7d';

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, SALT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
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

export async function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const decoded = verifyToken(token);
    const [user] = await sql`SELECT id FROM users WHERE id = ${decoded.userId}`;
    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }
    req.userId = decoded.userId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
