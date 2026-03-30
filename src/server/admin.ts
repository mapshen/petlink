import type { Response, NextFunction } from 'express';
import { authMiddleware, type AuthenticatedRequest } from './auth.ts';
import sql from './db.ts';

export function isAdminEmail(email: string): boolean {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return false;
  return email.toLowerCase() === adminEmail.toLowerCase();
}

export function hasRole(roles: string[], role: string): boolean {
  return roles.includes(role);
}

export function hasSitterRole(roles: string[]): boolean {
  return roles.includes('sitter');
}

export function isAdminUser(email: string, roles: string[]): boolean {
  return isAdminEmail(email) && hasRole(roles, 'admin');
}

export async function adminMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  await authMiddleware(req, res, () => {});

  if (!req.userId) return;

  const [user] = await sql`SELECT email, roles FROM users WHERE id = ${req.userId}`;
  if (!user || !isAdminUser(user.email, user.roles)) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }

  next();
}
