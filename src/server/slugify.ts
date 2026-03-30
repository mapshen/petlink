import sql from './db.ts';

/**
 * Generate a URL-friendly slug from a name.
 * Ensures uniqueness by appending a numeric suffix if needed.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export async function generateUniqueSlug(name: string, userId?: number): Promise<string> {
  const base = slugify(name);
  if (!base) return `sitter-${userId || Date.now()}`;

  // Check if base slug is available (excluding current user)
  const [existing] = await sql`
    SELECT id FROM users WHERE slug = ${base} ${userId ? sql`AND id != ${userId}` : sql``} LIMIT 1
  `;

  if (!existing) return base;

  // Append numeric suffix
  const [maxSuffix] = await sql`
    SELECT slug FROM users WHERE slug LIKE ${base + '-%'} ORDER BY LENGTH(slug) DESC, slug DESC LIMIT 1
  `;

  if (!maxSuffix) return `${base}-2`;

  const lastPart = maxSuffix.slug.split('-').pop();
  const num = parseInt(lastPart, 10);
  return `${base}-${(isNaN(num) ? 1 : num) + 1}`;
}
