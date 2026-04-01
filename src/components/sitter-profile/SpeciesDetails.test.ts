import { describe, it, expect } from 'vitest';
import { buildSpeciesBadges, getServicesForSpecies } from './SpeciesDetails';
import type { SitterSpeciesProfile, Service } from '../../types';

const dogProfile: SitterSpeciesProfile = {
  id: 1, sitter_id: 1, species: 'dog', years_experience: 10,
  accepted_pet_sizes: ['small', 'medium', 'large'], skills: ['pet_first_aid', 'dog_training'],
  max_pets: 3, max_pets_per_walk: 2, has_yard: true, has_fenced_yard: true,
  dogs_on_furniture: true, dogs_on_bed: false, potty_break_frequency: 'every 4 hours',
  accepts_puppies: true, accepts_unspayed: false, accepts_unneutered: false,
  accepts_females_in_heat: false, owns_same_species: true,
  own_pets_description: 'A golden retriever named Max', created_at: '',
};

const catProfile: SitterSpeciesProfile = {
  id: 2, sitter_id: 1, species: 'cat', years_experience: 3,
  accepted_pet_sizes: ['small', 'medium'], skills: ['medication_admin'],
  max_pets: 5, has_yard: false, has_fenced_yard: false,
  dogs_on_furniture: false, dogs_on_bed: false,
  accepts_puppies: true, accepts_unspayed: true, accepts_unneutered: true,
  accepts_females_in_heat: true, owns_same_species: false, created_at: '',
};

describe('buildSpeciesBadges', () => {
  it('creates badges with species emoji and experience', () => {
    const badges = buildSpeciesBadges([dogProfile, catProfile]);
    expect(badges).toHaveLength(2);
    expect(badges[0]).toEqual({ species: 'dog', emoji: '🐕', label: 'Dog', years: 10 });
    expect(badges[1]).toEqual({ species: 'cat', emoji: '🐱', label: 'Cat', years: 3 });
  });

  it('handles missing experience', () => {
    const profiles = [{ ...catProfile, years_experience: undefined }];
    const badges = buildSpeciesBadges(profiles);
    expect(badges[0].years).toBeUndefined();
  });

  it('formats small_animal species name', () => {
    const profiles = [{ ...catProfile, species: 'small_animal' }];
    const badges = buildSpeciesBadges(profiles);
    expect(badges[0].label).toBe('Small Animal');
    expect(badges[0].emoji).toBe('🐹');
  });

  it('returns empty array for no profiles', () => {
    expect(buildSpeciesBadges([])).toEqual([]);
  });
});

describe('getServicesForSpecies', () => {
  const services: Service[] = [
    { id: 1, sitter_id: 1, type: 'walking', price: 25, species: 'dog' },
    { id: 2, sitter_id: 1, type: 'sitting', price: 50, species: 'dog' },
    { id: 3, sitter_id: 1, type: 'sitting', price: 40, species: 'cat' },
    { id: 4, sitter_id: 1, type: 'drop-in', price: 20, species: 'cat' },
    { id: 5, sitter_id: 1, type: 'grooming', price: 45 },
  ];

  it('filters services by species', () => {
    const dogServices = getServicesForSpecies(services, 'dog');
    expect(dogServices.map((s) => s.type)).toEqual(['walking', 'sitting']);
  });

  it('returns only matching species services', () => {
    const catServices = getServicesForSpecies(services, 'cat');
    expect(catServices.map((s) => s.type)).toEqual(['sitting', 'drop-in']);
  });

  it('includes services with no species tag', () => {
    const dogServices = getServicesForSpecies(services, 'dog');
    const catServices = getServicesForSpecies(services, 'cat');
    // Services without species tag should NOT be included when filtering
    expect(dogServices).toHaveLength(2);
    expect(catServices).toHaveLength(2);
  });

  it('returns all services when species is null', () => {
    const all = getServicesForSpecies(services, null);
    expect(all).toHaveLength(5);
  });

  it('handles empty services array', () => {
    expect(getServicesForSpecies([], 'dog')).toEqual([]);
  });
});
