import { describe, it, expect } from 'vitest';
import { getHighlightServices } from './ServiceHighlights';
import { getServiceLabel } from '../../shared/service-labels';
import type { Service } from '../../types';

const services: Service[] = [
  { id: 1, sitter_id: 2, type: 'walking', species: 'dog', price_cents: 2500 },
  { id: 2, sitter_id: 2, type: 'boarding', species: 'dog', price_cents: 6500 },
  { id: 3, sitter_id: 2, type: 'sitting', species: 'cat', price_cents: 3500 },
  { id: 4, sitter_id: 2, type: 'meet_greet', price_cents: 0 },
  { id: 5, sitter_id: 2, type: 'boarding', species: 'cat', price_cents: 5000 },
];

describe('getHighlightServices', () => {
  it('excludes meet_greet from highlights', () => {
    const result = getHighlightServices(services, null);
    expect(result.find(s => s.type === 'meet_greet')).toBeUndefined();
  });

  it('returns all non-meet_greet services when no species filter', () => {
    const result = getHighlightServices(services, null);
    expect(result).toHaveLength(4);
  });

  it('filters by species when selectedSpecies is set', () => {
    const dogServices = getHighlightServices(services, 'dog');
    expect(dogServices).toHaveLength(2);
    expect(dogServices.every(s => s.species === 'dog')).toBe(true);
  });

  it('returns only cat services for cat filter', () => {
    const catServices = getHighlightServices(services, 'cat');
    expect(catServices).toHaveLength(2);
    expect(catServices.every(s => s.species === 'cat')).toBe(true);
  });

  it('returns empty array when no services match species', () => {
    const result = getHighlightServices(services, 'bird');
    expect(result).toHaveLength(0);
  });

  it('returns empty array for empty services', () => {
    const result = getHighlightServices([], null);
    expect(result).toHaveLength(0);
  });

  it('preserves service order', () => {
    const result = getHighlightServices(services, null);
    expect(result.map(s => s.type)).toEqual(['walking', 'boarding', 'sitting', 'boarding']);
  });
});

describe('getServiceLabel (shared)', () => {
  it('returns species-neutral labels', () => {
    expect(getServiceLabel('walking')).toBe('Walking');
    expect(getServiceLabel('sitting')).toBe('House Sitting');
    expect(getServiceLabel('drop-in')).toBe('Drop-in Visit');
    expect(getServiceLabel('grooming')).toBe('Grooming');
    expect(getServiceLabel('meet_greet')).toBe('Meet & Greet');
  });

  it('handles boarding type', () => {
    expect(getServiceLabel('boarding')).toBe('Boarding');
  });
});
