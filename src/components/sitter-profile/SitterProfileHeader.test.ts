import { describe, it, expect } from 'vitest';
import { buildHeaderTags, formatSkill } from './SitterProfileHeader';
import type { User } from '../../types';

const baseSitter: User = {
  id: 2,
  email: 'sitter@test.com',
  name: 'Bob Sitter',
  roles: ['owner', 'sitter'],
  bio: 'Experienced dog walker.',
  avatar_url: 'https://example.com/avatar.jpg',
  avg_rating: 4.9,
  review_count: 24,
  years_experience: 5,
  accepted_species: ['dog', 'cat'],
  accepted_pet_sizes: ['small', 'medium', 'large'],
  skills: ['pet_first_aid', 'dog_training'],
  home_type: 'house',
  has_yard: true,
  has_fenced_yard: true,
  has_own_pets: false,
  subscription_tier: 'free',
};

describe('formatSkill', () => {
  it('converts snake_case to Title Case', () => {
    expect(formatSkill('pet_first_aid')).toBe('Pet First Aid');
  });

  it('handles single word', () => {
    expect(formatSkill('grooming')).toBe('Grooming');
  });

  it('handles already formatted string', () => {
    expect(formatSkill('Dog Training')).toBe('Dog Training');
  });
});

describe('buildHeaderTags', () => {
  it('includes species, pet sizes, home type, yard, and skills', () => {
    const tags = buildHeaderTags(baseSitter);
    expect(tags).toContain('dog');
    expect(tags).toContain('cat');
    expect(tags).toContain('small');
    expect(tags).toContain('medium');
    expect(tags).toContain('large');
    expect(tags).toContain('house');
    expect(tags).toContain('fenced yard');
    expect(tags).toContain('Pet First Aid');
    expect(tags).toContain('Dog Training');
  });

  it('shows fenced yard when has_fenced_yard is true', () => {
    const tags = buildHeaderTags({ ...baseSitter, has_fenced_yard: true });
    expect(tags).toContain('fenced yard');
    expect(tags).not.toContain('yard');
  });

  it('shows yard when has_yard but not fenced', () => {
    const tags = buildHeaderTags({ ...baseSitter, has_fenced_yard: false });
    expect(tags).toContain('yard');
    expect(tags).not.toContain('fenced yard');
  });

  it('omits yard tag when has_yard is false', () => {
    const tags = buildHeaderTags({ ...baseSitter, has_yard: false, has_fenced_yard: false });
    expect(tags).not.toContain('yard');
    expect(tags).not.toContain('fenced yard');
  });

  it('handles sitter with no species', () => {
    const tags = buildHeaderTags({ ...baseSitter, accepted_species: undefined });
    expect(tags).not.toContain('dog');
    expect(tags).not.toContain('cat');
  });

  it('handles sitter with no skills', () => {
    const tags = buildHeaderTags({ ...baseSitter, skills: undefined });
    expect(tags).not.toContain('Pet First Aid');
    expect(tags).not.toContain('Dog Training');
  });

  it('handles sitter with no home_type', () => {
    const tags = buildHeaderTags({ ...baseSitter, home_type: undefined });
    expect(tags).not.toContain('house');
  });

  it('returns empty array for minimal sitter', () => {
    const minimal: User = { id: 1, email: 'a@b.com', name: 'A', roles: ['owner'] };
    expect(buildHeaderTags(minimal)).toEqual([]);
  });

  it('replaces underscores in species names', () => {
    const tags = buildHeaderTags({ ...baseSitter, accepted_species: ['small_animal'] });
    expect(tags).toContain('small animal');
  });

  it('includes accepted pet sizes', () => {
    const tags = buildHeaderTags(baseSitter);
    expect(tags).toContain('small');
    expect(tags).toContain('medium');
    expect(tags).toContain('large');
  });

  it('omits pet sizes when empty', () => {
    const tags = buildHeaderTags({ ...baseSitter, accepted_pet_sizes: [] });
    expect(tags).not.toContain('small');
    expect(tags).not.toContain('medium');
    expect(tags).not.toContain('large');
  });

  it('includes has own pets tag', () => {
    const tags = buildHeaderTags({ ...baseSitter, has_own_pets: true });
    expect(tags).toContain('has own pets');
  });

  it('omits has own pets when false', () => {
    const tags = buildHeaderTags(baseSitter);
    expect(tags).not.toContain('has own pets');
  });
});
