import { describe, it, expect } from 'vitest';
import {
  BADGE_CATALOG,
  BADGE_SLUGS,
  AUTO_BADGE_SLUGS,
  MANUAL_BADGE_SLUGS,
  getBadgeBySlug,
  getBadgeLabel,
  getBadgesByCategory,
  resolveActiveBadges,
} from './badge-catalog';

describe('BADGE_CATALOG', () => {
  it('has unique slugs', () => {
    const slugSet = new Set(BADGE_SLUGS);
    expect(slugSet.size).toBe(BADGE_SLUGS.length);
  });

  it('every badge has required fields', () => {
    for (const badge of BADGE_CATALOG) {
      expect(badge.slug).toBeTruthy();
      expect(badge.label).toBeTruthy();
      expect(badge.description).toBeTruthy();
      expect(badge.icon).toBeTruthy();
      expect(['home_environment', 'certifications', 'experience']).toContain(badge.category);
    }
  });

  it('auto slugs and manual slugs are disjoint', () => {
    const overlap = AUTO_BADGE_SLUGS.filter((s) => MANUAL_BADGE_SLUGS.includes(s));
    expect(overlap).toEqual([]);
  });

  it('auto + manual = all slugs', () => {
    const combined = [...AUTO_BADGE_SLUGS, ...MANUAL_BADGE_SLUGS].sort();
    const all = [...BADGE_SLUGS].sort();
    expect(combined).toEqual(all);
  });
});

describe('getBadgeBySlug', () => {
  it('returns badge for valid slug', () => {
    const badge = getBadgeBySlug('fenced_yard');
    expect(badge).toBeDefined();
    expect(badge?.label).toBe('Fenced Yard');
  });

  it('returns undefined for unknown slug', () => {
    expect(getBadgeBySlug('nonexistent')).toBeUndefined();
  });
});

describe('getBadgeLabel', () => {
  it('returns label for known slug', () => {
    expect(getBadgeLabel('smoke_free')).toBe('Smoke-Free Home');
  });

  it('returns formatted slug for unknown slug', () => {
    expect(getBadgeLabel('some_unknown')).toBe('some unknown');
  });
});

describe('getBadgesByCategory', () => {
  it('returns 3 categories', () => {
    const groups = getBadgesByCategory();
    expect(groups).toHaveLength(3);
    expect(groups.map((g) => g.category)).toEqual([
      'home_environment',
      'certifications',
      'experience',
    ]);
  });

  it('every badge is in exactly one category', () => {
    const groups = getBadgesByCategory();
    const allSlugs = groups.flatMap((g) => g.badges.map((b) => b.slug));
    expect(allSlugs.sort()).toEqual([...BADGE_SLUGS].sort());
  });

  it('has human-readable category labels', () => {
    const groups = getBadgesByCategory();
    expect(groups[0].label).toBe('Home Environment');
    expect(groups[1].label).toBe('Certifications');
    expect(groups[2].label).toBe('Experience');
  });
});

describe('resolveActiveBadges', () => {
  it('returns empty array for user with no badges', () => {
    const badges = resolveActiveBadges({});
    expect(badges).toEqual([]);
  });

  it('derives fenced_yard from has_fenced_yard=true', () => {
    const badges = resolveActiveBadges({ has_fenced_yard: true });
    expect(badges).toContain('fenced_yard');
  });

  it('does not derive fenced_yard when has_fenced_yard=false', () => {
    const badges = resolveActiveBadges({ has_fenced_yard: false });
    expect(badges).not.toContain('fenced_yard');
  });

  it('derives smoke_free from non_smoking_home=true', () => {
    const badges = resolveActiveBadges({ non_smoking_home: true });
    expect(badges).toContain('smoke_free');
  });

  it('derives insured from has_insurance=true', () => {
    const badges = resolveActiveBadges({ has_insurance: true });
    expect(badges).toContain('insured');
  });

  it('derives one_client from one_client_at_a_time=true', () => {
    const badges = resolveActiveBadges({ one_client_at_a_time: true });
    expect(badges).toContain('one_client');
  });

  it('includes manual badges from lifestyle_badges', () => {
    const badges = resolveActiveBadges({
      lifestyle_badges: ['no_children', 'dog_training', 'pet_first_aid'],
    });
    expect(badges).toContain('no_children');
    expect(badges).toContain('dog_training');
    expect(badges).toContain('pet_first_aid');
  });

  it('ignores invalid slugs in lifestyle_badges', () => {
    const badges = resolveActiveBadges({
      lifestyle_badges: ['no_children', 'invalid_badge'],
    });
    expect(badges).toContain('no_children');
    expect(badges).not.toContain('invalid_badge');
  });

  it('ignores auto-derived slugs in lifestyle_badges (prevents duplication)', () => {
    const badges = resolveActiveBadges({
      has_fenced_yard: true,
      lifestyle_badges: ['fenced_yard'], // auto slug should not duplicate
    });
    const fencedCount = badges.filter((b) => b === 'fenced_yard').length;
    expect(fencedCount).toBe(1);
  });

  it('combines auto and manual badges', () => {
    const badges = resolveActiveBadges({
      has_fenced_yard: true,
      non_smoking_home: true,
      has_insurance: false,
      lifestyle_badges: ['pet_first_aid', 'senior_pets'],
    });
    expect(badges).toContain('fenced_yard');
    expect(badges).toContain('smoke_free');
    expect(badges).not.toContain('insured');
    expect(badges).toContain('pet_first_aid');
    expect(badges).toContain('senior_pets');
  });
});
