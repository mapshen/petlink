import { describe, it, expect } from 'vitest';
import { buildSpeciesProfiles, type SitterRow } from './backfill-species-profiles';

const baseSitter: SitterRow = {
  id: 1,
  accepted_species: ['dog'],
  years_experience: 5,
  accepted_pet_sizes: ['small', 'medium', 'large'],
  skills: ['pet_first_aid', 'dog_training'],
  max_pets_at_once: 3,
  max_pets_per_walk: 2,
  has_yard: true,
  has_fenced_yard: true,
  has_own_pets: true,
  own_pets_description: 'One golden retriever',
};

describe('buildSpeciesProfiles', () => {
  it('creates one profile per accepted species', () => {
    const sitter: SitterRow = { ...baseSitter, accepted_species: ['dog', 'cat', 'bird'] };
    const profiles = buildSpeciesProfiles(sitter);
    expect(profiles).toHaveLength(3);
    expect(profiles.map((p) => p.species)).toEqual(['dog', 'cat', 'bird']);
  });

  it('copies experience and sizes to all species profiles', () => {
    const sitter: SitterRow = { ...baseSitter, accepted_species: ['dog', 'cat'] };
    const profiles = buildSpeciesProfiles(sitter);
    for (const p of profiles) {
      expect(p.sitter_id).toBe(1);
      expect(p.years_experience).toBe(5);
      expect(p.accepted_pet_sizes).toEqual(['small', 'medium', 'large']);
      expect(p.skills).toEqual(['pet_first_aid', 'dog_training']);
    }
  });

  it('sets yard fields only for dog profiles', () => {
    const sitter: SitterRow = { ...baseSitter, accepted_species: ['dog', 'cat'] };
    const profiles = buildSpeciesProfiles(sitter);
    expect(profiles[0].has_yard).toBe(true);
    expect(profiles[0].has_fenced_yard).toBe(true);
    expect(profiles[1].has_yard).toBe(false);
    expect(profiles[1].has_fenced_yard).toBe(false);
  });

  it('sets max_pets_per_walk only for dog profiles', () => {
    const sitter: SitterRow = { ...baseSitter, accepted_species: ['dog', 'cat'] };
    const profiles = buildSpeciesProfiles(sitter);
    expect(profiles[0].max_pets_per_walk).toBe(2);
    expect(profiles[1].max_pets_per_walk).toBeNull();
  });

  it('maps has_own_pets to owns_same_species', () => {
    const profiles = buildSpeciesProfiles(baseSitter);
    expect(profiles[0].owns_same_species).toBe(true);
    expect(profiles[0].own_pets_description).toBe('One golden retriever');
  });

  it('clears own_pets_description when has_own_pets is false', () => {
    const sitter: SitterRow = { ...baseSitter, has_own_pets: false, own_pets_description: 'should be cleared' };
    const profiles = buildSpeciesProfiles(sitter);
    expect(profiles[0].owns_same_species).toBe(false);
    expect(profiles[0].own_pets_description).toBeNull();
  });

  it('uses default values for missing optional fields', () => {
    const sitter: SitterRow = {
      id: 2,
      accepted_species: ['bird'],
      years_experience: null,
      accepted_pet_sizes: [],
      skills: [],
      max_pets_at_once: null,
      max_pets_per_walk: null,
      has_yard: false,
      has_fenced_yard: false,
      has_own_pets: false,
      own_pets_description: null,
    };
    const profiles = buildSpeciesProfiles(sitter);
    expect(profiles[0].max_pets).toBe(3);
    expect(profiles[0].years_experience).toBeNull();
    expect(profiles[0].accepted_pet_sizes).toEqual([]);
    expect(profiles[0].skills).toEqual([]);
  });

  it('returns empty array for sitter with no accepted species', () => {
    const sitter: SitterRow = { ...baseSitter, accepted_species: [] };
    expect(buildSpeciesProfiles(sitter)).toEqual([]);
  });
});

