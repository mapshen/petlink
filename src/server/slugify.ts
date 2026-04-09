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

type SlugTable = 'users' | 'pets';

const FALLBACK_PREFIX: Record<SlugTable, string> = {
  users: 'sitter',
  pets: 'pet',
};

export async function generateUniqueSlug(
  name: string,
  table: SlugTable = 'users',
  excludeId?: number
): Promise<string> {
  const base = slugify(name);
  if (!base) return `${FALLBACK_PREFIX[table]}-${randomSuffix()}`;

  const checkSlug = (candidate: string) => {
    if (table === 'pets') {
      return excludeId
        ? sql`SELECT id FROM pets WHERE slug = ${candidate} AND id != ${excludeId} LIMIT 1`
        : sql`SELECT id FROM pets WHERE slug = ${candidate} LIMIT 1`;
    }
    return excludeId
      ? sql`SELECT id FROM users WHERE slug = ${candidate} AND id != ${excludeId} LIMIT 1`
      : sql`SELECT id FROM users WHERE slug = ${candidate} LIMIT 1`;
  };

  // Check if base slug is available
  const [existing] = await checkSlug(base);
  if (!existing) return base;

  // Append random suffix and retry if collision
  for (let i = 0; i < 5; i++) {
    const candidate = `${base}-${randomSuffix()}`;
    const [dup] = await checkSlug(candidate);
    if (!dup) return candidate;
  }

  // Fallback: longer random suffix
  return `${base}-${crypto.randomBytes(4).toString('hex')}`;
}
