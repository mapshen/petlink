import { describe, it, expect } from 'vitest';
import { getServiceLabel, getServiceLabelPlural, getAvailableServices, getAvailableSkills, getSkillGroups, areSizesRelevant, isWalkCapacityRelevant, SPECIES_SERVICES, ALL_SERVICE_TYPES } from './service-labels';

describe('getServiceLabel', () => {
  it('returns generic label with no species', () => {
    expect(getServiceLabel('walking')).toBe('Pet Walking');
    expect(getServiceLabel('sitting')).toBe('House Sitting');
    expect(getServiceLabel('daycare')).toBe('Daycare');
  });

  it('returns dog-specific label for dog-only sitter', () => {
    expect(getServiceLabel('walking', ['dog'])).toBe('Dog Walking');
    expect(getServiceLabel('sitting', ['dog'])).toBe('Dog Sitting');
    expect(getServiceLabel('grooming', ['dog'])).toBe('Dog Grooming');
    expect(getServiceLabel('daycare', ['dog'])).toBe('Dog Daycare');
  });

  it('returns cat-specific label for cat-only sitter', () => {
    expect(getServiceLabel('sitting', ['cat'])).toBe('Cat Sitting');
    expect(getServiceLabel('grooming', ['cat'])).toBe('Cat Grooming');
  });

  it('returns generic label for multi-species sitter', () => {
    expect(getServiceLabel('walking', ['dog', 'cat'])).toBe('Pet Walking');
    expect(getServiceLabel('sitting', ['dog', 'cat'])).toBe('House Sitting');
  });

  it('returns generic label for species without specific labels', () => {
    expect(getServiceLabel('sitting', ['bird'])).toBe('House Sitting');
    expect(getServiceLabel('sitting', ['reptile'])).toBe('House Sitting');
  });

  it('handles unknown service type gracefully', () => {
    expect(getServiceLabel('boarding')).toBe('Boarding');
  });
});

describe('getServiceLabelPlural', () => {
  it('returns plural labels', () => {
    expect(getServiceLabelPlural('walking')).toBe('Pet Walkers');
    expect(getServiceLabelPlural('sitting')).toBe('House Sitters');
    expect(getServiceLabelPlural('daycare')).toBe('Daycare Providers');
  });
});

describe('getAvailableServices', () => {
  it('returns all services when no species specified', () => {
    expect(getAvailableServices()).toEqual(ALL_SERVICE_TYPES);
    expect(getAvailableServices([])).toEqual(ALL_SERVICE_TYPES);
  });

  it('returns dog services for dog sitters', () => {
    const services = getAvailableServices(['dog']);
    expect(services).toContain('walking');
    expect(services).toContain('daycare');
    expect(services).toContain('sitting');
    expect(services).toContain('grooming');
    expect(services).toContain('meet_greet');
  });

  it('excludes walking and daycare for cat sitters', () => {
    const services = getAvailableServices(['cat']);
    expect(services).not.toContain('walking');
    expect(services).not.toContain('daycare');
    expect(services).toContain('sitting');
    expect(services).toContain('drop-in');
    expect(services).toContain('grooming');
  });

  it('excludes grooming for bird sitters', () => {
    const services = getAvailableServices(['bird']);
    expect(services).not.toContain('walking');
    expect(services).not.toContain('daycare');
    expect(services).not.toContain('grooming');
    expect(services).toContain('sitting');
    expect(services).toContain('drop-in');
  });

  it('combines services for multi-species sitters', () => {
    const services = getAvailableServices(['dog', 'cat']);
    expect(services).toContain('walking');
    expect(services).toContain('daycare');
    expect(services).toContain('grooming');
    expect(services).toContain('sitting');
  });

  it('preserves canonical order', () => {
    const services = getAvailableServices(['cat', 'dog']);
    expect(services[0]).toBe('walking');
    expect(services[1]).toBe('daycare');
  });
});

describe('SPECIES_SERVICES', () => {
  it('all species have meet_greet', () => {
    for (const [species, services] of Object.entries(SPECIES_SERVICES)) {
      expect(services).toContain('meet_greet');
    }
  });

  it('only dog has walking and daycare', () => {
    expect(SPECIES_SERVICES.dog).toContain('walking');
    expect(SPECIES_SERVICES.dog).toContain('daycare');
    expect(SPECIES_SERVICES.cat).not.toContain('walking');
    expect(SPECIES_SERVICES.cat).not.toContain('daycare');
    expect(SPECIES_SERVICES.bird).not.toContain('walking');
    expect(SPECIES_SERVICES.reptile).not.toContain('walking');
  });
});

describe('getAvailableSkills', () => {
  it('returns all skills with no species', () => {
    expect(getAvailableSkills().length).toBeGreaterThan(10);
  });

  it('includes universal + dog skills for dog sitters', () => {
    const skills = getAvailableSkills(['dog']);
    expect(skills.map((s) => s.value)).toContain('pet_first_aid');
    expect(skills.map((s) => s.value)).toContain('dog_training');
    expect(skills.map((s) => s.value)).toContain('puppy_care');
    expect(skills.map((s) => s.value)).not.toContain('cat_behavior');
    expect(skills.map((s) => s.value)).not.toContain('avian_care');
  });

  it('includes universal + cat skills for cat sitters', () => {
    const skills = getAvailableSkills(['cat']);
    expect(skills.map((s) => s.value)).toContain('pet_first_aid');
    expect(skills.map((s) => s.value)).toContain('cat_behavior');
    expect(skills.map((s) => s.value)).not.toContain('dog_training');
  });

  it('combines dog + cat skills for multi-species sitter', () => {
    const skills = getAvailableSkills(['dog', 'cat']);
    expect(skills.map((s) => s.value)).toContain('dog_training');
    expect(skills.map((s) => s.value)).toContain('cat_behavior');
  });
});

describe('getSkillGroups', () => {
  it('groups skills by species', () => {
    const groups = getSkillGroups(['dog', 'cat']);
    expect(groups.map((g) => g.label)).toContain('Universal');
    expect(groups.map((g) => g.label)).toContain('Dog');
    expect(groups.map((g) => g.label)).toContain('Cat');
  });

  it('omits species groups for unselected species', () => {
    const groups = getSkillGroups(['cat']);
    expect(groups.map((g) => g.label)).not.toContain('Dog');
  });
});

describe('areSizesRelevant', () => {
  it('returns true for dog/cat/small_animal', () => {
    expect(areSizesRelevant(['dog'])).toBe(true);
    expect(areSizesRelevant(['cat'])).toBe(true);
    expect(areSizesRelevant(['small_animal'])).toBe(true);
  });

  it('returns false for bird/reptile only', () => {
    expect(areSizesRelevant(['bird'])).toBe(false);
    expect(areSizesRelevant(['reptile'])).toBe(false);
    expect(areSizesRelevant(['bird', 'reptile'])).toBe(false);
  });

  it('returns true for mixed with dog', () => {
    expect(areSizesRelevant(['bird', 'dog'])).toBe(true);
  });
});

describe('isWalkCapacityRelevant', () => {
  it('returns true only when dog is included', () => {
    expect(isWalkCapacityRelevant(['dog'])).toBe(true);
    expect(isWalkCapacityRelevant(['dog', 'cat'])).toBe(true);
    expect(isWalkCapacityRelevant(['cat'])).toBe(false);
    expect(isWalkCapacityRelevant(['bird'])).toBe(false);
  });
});
