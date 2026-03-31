import { describe, it, expect } from 'vitest';
import { getServiceLabel, getServiceLabelPlural, getAvailableServices, SPECIES_SERVICES, ALL_SERVICE_TYPES } from './service-labels';

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
