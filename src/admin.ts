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
  await new Promise<void>((resolve) => {
    authMiddleware(req, res, () => resolve());
  });

  if (!req.userId) return;

  const [user] = await sql`SELECT email FROM users WHERE id = ${req.userId}`;
  if (!user || !isAdminUser(user.email)) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  next();
}
