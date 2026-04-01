import { describe, it, expect } from 'vitest';
import type { Service, Pet } from '../../types';

/**
 * Tests for the species-aware booking service filtering logic
 * used in SitterProfile.tsx to filter services by selected pets' species.
 */

function getBookingServices(services: Service[], pets: Pet[], selectedPetIds: number[]): Service[] {
  const selectedPetSpecies: string[] = [...new Set(pets.filter((p) => selectedPetIds.includes(p.id)).map((p) => p.species as string))];
  return selectedPetSpecies.length > 0
    ? services.filter((s) => !s.species || selectedPetSpecies.includes(s.species))
    : services;
}

const dogWalking: Service = { id: 1, sitter_id: 1, type: 'walking', price_cents: 2500, species: 'dog' };
const dogSitting: Service = { id: 2, sitter_id: 1, type: 'sitting', price_cents: 5000, species: 'dog' };
const catSitting: Service = { id: 3, sitter_id: 1, type: 'sitting', price_cents: 4000, species: 'cat' };
const catDropIn: Service = { id: 4, sitter_id: 1, type: 'drop-in', price_cents: 2000, species: 'cat' };
const meetGreet: Service = { id: 5, sitter_id: 1, type: 'meet_greet', price_cents: 0 }; // no species tag

const allServices = [dogWalking, dogSitting, catSitting, catDropIn, meetGreet];

const dogPet: Pet = { id: 1, owner_id: 10, name: 'Buddy', species: 'dog', breed: 'Lab', age: 3, weight: 30 };
const catPet: Pet = { id: 2, owner_id: 10, name: 'Whiskers', species: 'cat', breed: 'Tabby', age: 5, weight: 8 };
const allPets = [dogPet, catPet];

describe('getBookingServices', () => {
  it('shows all services when no pets are selected', () => {
    const result = getBookingServices(allServices, allPets, []);
    expect(result).toHaveLength(5);
  });

  it('filters to dog services when only a dog is selected', () => {
    const result = getBookingServices(allServices, allPets, [dogPet.id]);
    expect(result.map((s) => s.id)).toEqual([1, 2, 5]); // dog walking, dog sitting, meet & greet (no species)
  });

  it('filters to cat services when only a cat is selected', () => {
    const result = getBookingServices(allServices, allPets, [catPet.id]);
    expect(result.map((s) => s.id)).toEqual([3, 4, 5]); // cat sitting, cat drop-in, meet & greet
  });

  it('shows all matching services when both species selected', () => {
    const result = getBookingServices(allServices, allPets, [dogPet.id, catPet.id]);
    expect(result).toHaveLength(5); // all services match
  });

  it('includes services without species tag regardless of selection', () => {
    const result = getBookingServices(allServices, allPets, [dogPet.id]);
    expect(result.find((s) => s.type === 'meet_greet')).toBeDefined();
  });

  it('excludes services for unselected species', () => {
    const result = getBookingServices(allServices, allPets, [dogPet.id]);
    expect(result.find((s) => s.species === 'cat')).toBeUndefined();
  });
});
