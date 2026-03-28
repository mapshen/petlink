import type { Response, NextFunction } from 'express';
import { authMiddleware, type AuthenticatedRequest } from './auth.ts';
import sql from './db.ts';

export function isAdminUser(email: string): boolean {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return false;
  return email.toLowerCase() === adminEmail.toLowerCase();
}

export async function adminMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  // authMiddleware is async — await it directly instead of wrapping in a Promise
  // When auth fails, it sends a response and doesn't call next, so req.userId stays unset
  await authMiddleware(req, res, () => {});

  if (!req.userId) return;

  const [user] = await sql`SELECT email FROM users WHERE id = ${req.userId}`;
  if (!user || !isAdminUser(user.email)) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  next();
}
