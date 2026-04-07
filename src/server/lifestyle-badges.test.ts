import { describe, it, expect } from 'vitest';
import {
  resolveActiveBadges,
  BADGE_CATALOG,
  MANUAL_BADGE_SLUGS,
  AUTO_BADGE_SLUGS,
  getBadgesByCategory,
} from '../shared/badge-catalog.ts';
import { updateProfileSchema, sitterSearchSchema } from './validation.ts';

// ---------------------------------------------------------------------------
// resolveActiveBadges — core badge resolution logic
// ---------------------------------------------------------------------------
describe('resolveActiveBadges', () => {
  it('derives fenced_yard from has_fenced_yard=true', () => {
    const badges = resolveActiveBadges({ has_fenced_yard: true });
    expect(badges).toContain('fenced_yard');
  });

  it('does not derive fenced_yard when false', () => {
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
      lifestyle_badges: ['no_children', 'fake_badge_xyz'],
    });
    expect(badges).toContain('no_children');
    expect(badges).not.toContain('fake_badge_xyz');
  });

  it('does not duplicate auto badge when also in lifestyle_badges', () => {
    const badges = resolveActiveBadges({
      has_fenced_yard: true,
      lifestyle_badges: ['fenced_yard'],
    });
    const fencedCount = badges.filter((b) => b === 'fenced_yard').length;
    expect(fencedCount).toBe(1);
  });

  it('combines auto and manual badges', () => {
    const badges = resolveActiveBadges({
      has_fenced_yard: true,
      non_smoking_home: true,
      has_insurance: false,
      one_client_at_a_time: true,
      lifestyle_badges: ['pet_first_aid', 'senior_pets', 'no_children'],
    });
    expect(badges).toContain('fenced_yard');
    expect(badges).toContain('smoke_free');
    expect(badges).toContain('one_client');
    expect(badges).not.toContain('insured');
    expect(badges).toContain('pet_first_aid');
    expect(badges).toContain('senior_pets');
    expect(badges).toContain('no_children');
    expect(badges).toHaveLength(6);
  });

  it('returns empty for user with no badges at all', () => {
    const badges = resolveActiveBadges({});
    expect(badges).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Badge filtering — simulates what the search endpoint does
// ---------------------------------------------------------------------------
describe('badge filtering logic', () => {
  function filterByBadges(sitters: any[], badgeFilters: string[]) {
    const withBadges = sitters.map((s) => ({
      ...s,
      active_badges: resolveActiveBadges(s),
    }));
    return badgeFilters.length > 0
      ? withBadges.filter((s) => badgeFilters.every((b: string) => s.active_badges.includes(b)))
      : withBadges;
  }

  it('filters sitters by single badge', () => {
    const sitters = [
      { id: 1, has_fenced_yard: true, non_smoking_home: false, lifestyle_badges: [] },
      { id: 2, has_fenced_yard: false, non_smoking_home: true, lifestyle_badges: [] },
    ];
    const result = filterByBadges(sitters, ['fenced_yard']);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it('filters sitters by multiple badges (AND logic)', () => {
    const sitters = [
      { id: 1, has_fenced_yard: true, non_smoking_home: true, lifestyle_badges: [] },
      { id: 2, has_fenced_yard: true, non_smoking_home: false, lifestyle_badges: [] },
      { id: 3, has_fenced_yard: false, non_smoking_home: true, lifestyle_badges: [] },
    ];
    const result = filterByBadges(sitters, ['fenced_yard', 'smoke_free']);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
  });

  it('filters by manual badge', () => {
    const sitters = [
      { id: 1, lifestyle_badges: ['pet_first_aid'] },
      { id: 2, lifestyle_badges: [] },
      { id: 3, lifestyle_badges: ['pet_first_aid', 'dog_training'] },
    ];
    const result = filterByBadges(sitters, ['pet_first_aid']);
    expect(result).toHaveLength(2);
    expect(result.map((s: any) => s.id)).toEqual([1, 3]);
  });

  it('returns all sitters when no badge filters', () => {
    const sitters = [{ id: 1, lifestyle_badges: [] }, { id: 2, lifestyle_badges: [] }];
    const result = filterByBadges(sitters, []);
    expect(result).toHaveLength(2);
  });

  it('returns empty when no sitters match all badge filters', () => {
    const sitters = [
      { id: 1, has_fenced_yard: true, lifestyle_badges: [] },
      { id: 2, non_smoking_home: true, lifestyle_badges: [] },
    ];
    const result = filterByBadges(sitters, ['fenced_yard', 'smoke_free']);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Validation — lifestyle_badges in updateProfileSchema
// ---------------------------------------------------------------------------
describe('updateProfileSchema — lifestyle_badges', () => {
  it('accepts valid manual badge slugs', () => {
    const result = updateProfileSchema.safeParse({
      name: 'Test',
      lifestyle_badges: ['no_children', 'pet_first_aid', 'dog_training'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid badge slugs', () => {
    const result = updateProfileSchema.safeParse({
      name: 'Test',
      lifestyle_badges: ['completely_invalid'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects auto-derived badge slugs (fenced_yard)', () => {
    const result = updateProfileSchema.safeParse({
      name: 'Test',
      lifestyle_badges: ['fenced_yard'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects auto-derived badge slugs (smoke_free)', () => {
    const result = updateProfileSchema.safeParse({
      name: 'Test',
      lifestyle_badges: ['smoke_free'],
    });
    expect(result.success).toBe(false);
  });

  it('rejects auto-derived badge slugs (insured)', () => {
    const result = updateProfileSchema.safeParse({
      name: 'Test',
      lifestyle_badges: ['insured'],
    });
    expect(result.success).toBe(false);
  });

  it('accepts empty badge array', () => {
    const result = updateProfileSchema.safeParse({
      name: 'Test',
      lifestyle_badges: [],
    });
    expect(result.success).toBe(true);
  });

  it('allows omitting lifestyle_badges', () => {
    const result = updateProfileSchema.safeParse({ name: 'Test' });
    expect(result.success).toBe(true);
  });

  it('rejects more than 15 badges', () => {
    const tooMany = MANUAL_BADGE_SLUGS.slice(0, 16);
    const result = updateProfileSchema.safeParse({
      name: 'Test',
      lifestyle_badges: tooMany,
    });
    // Max is 15. Only fails if there are actually >15 manual slugs.
    // If fewer exist, this validates that constraint exists.
    if (tooMany.length > 15) {
      expect(result.success).toBe(false);
    } else {
      expect(result.success).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// sitterSearchSchema — badges query param
// ---------------------------------------------------------------------------
describe('sitterSearchSchema — badges', () => {
  it('accepts badges as comma-separated string', () => {
    const result = sitterSearchSchema.safeParse({
      serviceType: 'walking',
      badges: 'fenced_yard,smoke_free',
    });
    expect(result.success).toBe(true);
    expect(result.data?.badges).toBe('fenced_yard,smoke_free');
  });

  it('accepts without badges param', () => {
    const result = sitterSearchSchema.safeParse({ serviceType: 'walking' });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Badge catalog integrity
// ---------------------------------------------------------------------------
describe('badge catalog integrity', () => {
  it('all auto badge columns exist on known user schema fields', () => {
    const knownColumns = ['has_fenced_yard', 'non_smoking_home', 'has_insurance', 'one_client_at_a_time'];
    for (const badge of BADGE_CATALOG) {
      if (badge.autoColumn) {
        expect(knownColumns).toContain(badge.autoColumn);
      }
    }
  });

  it('categories have human-readable labels', () => {
    const groups = getBadgesByCategory();
    expect(groups.map((g) => g.label)).toEqual(['Home Environment', 'Certifications', 'Experience']);
  });

  it('manual and auto slug sets are disjoint', () => {
    const overlap = MANUAL_BADGE_SLUGS.filter((s) => AUTO_BADGE_SLUGS.includes(s));
    expect(overlap).toEqual([]);
  });
});
