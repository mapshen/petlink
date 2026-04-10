import { describe, it, expect } from 'vitest';

/**
 * Pure logic test for profile path computation.
 * Mirrors useProfilePath hook logic without React context dependencies.
 */
function computeProfilePath(
  slug: string | null | undefined,
  mode: 'owner' | 'sitter',
  hasSitterRole: boolean
): string {
  if (!slug) return '/profile';
  if (mode === 'sitter' && hasSitterRole) return `/sitter/${slug}`;
  return `/owner/${slug}`;
}

describe('useProfilePath logic', () => {
  it('returns /profile when no slug', () => {
    expect(computeProfilePath(null, 'owner', false)).toBe('/profile');
    expect(computeProfilePath(undefined, 'owner', false)).toBe('/profile');
  });

  it('returns /owner/:slug for owner mode', () => {
    expect(computeProfilePath('jessica-r', 'owner', false)).toBe('/owner/jessica-r');
  });

  it('returns /sitter/:slug for sitter mode with sitter role', () => {
    expect(computeProfilePath('sarah-m', 'sitter', true)).toBe('/sitter/sarah-m');
  });

  it('returns /owner/:slug for sitter mode without sitter role', () => {
    expect(computeProfilePath('jessica-r', 'sitter', false)).toBe('/owner/jessica-r');
  });

  it('returns /owner/:slug for dual-role user in owner mode', () => {
    expect(computeProfilePath('jessica-r', 'owner', true)).toBe('/owner/jessica-r');
  });
});
