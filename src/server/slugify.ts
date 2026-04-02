import sql from './db.ts';
import crypto from 'crypto';

/**
 * Generate a URL-friendly slug from a name.
 * Uses random 4-char suffix for uniqueness (not sequential numbers).
 * Slug is permanent — does not change when name is updated.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function randomSuffix(): string {
  return crypto.randomBytes(2).toString('hex'); // 4 hex chars
}

export async function generateUniqueSlug(name: string, userId?: number): Promise<string> {
  const base = slugify(name);
  if (!base) return `sitter-${randomSuffix()}`;

  // Check if base slug is available (excluding current user)
  const [existing] = await sql`
    SELECT id FROM users WHERE slug = ${base} ${userId ? sql`AND id != ${userId}` : sql``} LIMIT 1
  `;

  if (!existing) return base;

  // Append random suffix and retry if collision
  for (let i = 0; i < 5; i++) {
    const candidate = `${base}-${randomSuffix()}`;
    const [dup] = await sql`SELECT id FROM users WHERE slug = ${candidate} LIMIT 1`;
    if (!dup) return candidate;
  }

  // Fallback: longer random suffix
  return `${base}-${crypto.randomBytes(4).toString('hex')}`;
}
