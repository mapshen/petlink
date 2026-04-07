import { describe, it, expect } from 'vitest';
import { getBadgeBySlug, BADGE_CATALOG, type BadgeDefinition } from '../../shared/badge-catalog';

/**
 * Tests for the LifestyleBadges component logic.
 * Since we're using Vitest (not jsdom), we test the data resolution
 * that backs the component rather than rendering.
 */

function resolveBadges(slugs: string[]): BadgeDefinition[] {
  return slugs
    .map(getBadgeBySlug)
    .filter((b): b is BadgeDefinition => b != null);
}

function getVisibleBadges(slugs: string[], maxVisible?: number): { visible: BadgeDefinition[]; remaining: number } {
  const resolved = resolveBadges(slugs);
  const visible = maxVisible != null ? resolved.slice(0, maxVisible) : resolved;
  const remaining = maxVisible != null ? Math.max(0, resolved.length - maxVisible) : 0;
  return { visible, remaining };
}

describe('LifestyleBadges resolution', () => {
  it('resolves valid badge slugs', () => {
    const resolved = resolveBadges(['fenced_yard', 'smoke_free', 'pet_first_aid']);
    expect(resolved).toHaveLength(3);
    expect(resolved[0].slug).toBe('fenced_yard');
    expect(resolved[1].slug).toBe('smoke_free');
    expect(resolved[2].slug).toBe('pet_first_aid');
  });

  it('filters out invalid slugs', () => {
    const resolved = resolveBadges(['fenced_yard', 'invalid_badge']);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].slug).toBe('fenced_yard');
  });

  it('returns empty for no badges', () => {
    expect(resolveBadges([])).toEqual([]);
  });

  it('applies maxVisible limit', () => {
    const allSlugs = BADGE_CATALOG.map((b) => b.slug);
    const { visible, remaining } = getVisibleBadges(allSlugs, 3);
    expect(visible).toHaveLength(3);
    expect(remaining).toBe(allSlugs.length - 3);
  });

  it('shows all when maxVisible is undefined', () => {
    const slugs = ['fenced_yard', 'smoke_free', 'pet_first_aid'];
    const { visible, remaining } = getVisibleBadges(slugs);
    expect(visible).toHaveLength(3);
    expect(remaining).toBe(0);
  });

  it('no overflow when badges count <= maxVisible', () => {
    const { visible, remaining } = getVisibleBadges(['fenced_yard', 'smoke_free'], 5);
    expect(visible).toHaveLength(2);
    expect(remaining).toBe(0);
  });

  it('every badge in catalog has a category color mapping', () => {
    const validCategories = ['home_environment', 'certifications', 'experience'];
    for (const badge of BADGE_CATALOG) {
      expect(validCategories).toContain(badge.category);
    }
  });
});
