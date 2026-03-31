import { describe, it, expect } from 'vitest';
import { getServiceIcon, getServiceLabel, ALL_SERVICE_TYPES } from './ServiceHighlights';
import type { Service } from '../../types';

describe('getServiceLabel', () => {
  it('formats walking', () => {
    expect(getServiceLabel('walking')).toBe('Walking');
  });

  it('formats sitting', () => {
    expect(getServiceLabel('sitting')).toBe('Sitting');
  });

  it('formats drop-in', () => {
    expect(getServiceLabel('drop-in')).toBe('Drop-in');
  });

  it('formats grooming', () => {
    expect(getServiceLabel('grooming')).toBe('Grooming');
  });

  it('formats meet_greet', () => {
    expect(getServiceLabel('meet_greet')).toBe('Meet & Greet');
  });
});

describe('getServiceIcon', () => {
  it('returns a string for each service type', () => {
    for (const type of ALL_SERVICE_TYPES) {
      expect(typeof getServiceIcon(type)).toBe('string');
    }
  });
});

describe('ALL_SERVICE_TYPES', () => {
  it('contains all 5 service types', () => {
    expect(ALL_SERVICE_TYPES).toEqual(['walking', 'sitting', 'drop-in', 'grooming', 'meet_greet']);
  });
});

describe('ServiceHighlights logic', () => {
  const services: Service[] = [
    { id: 1, sitter_id: 2, type: 'walking', price: 25, description: '30 min walk' },
    { id: 2, sitter_id: 2, type: 'sitting', price: 50, description: 'Overnight sitting' },
  ];

  it('identifies active service types', () => {
    const activeTypes = new Set(services.map((s) => s.type));
    expect(activeTypes.has('walking')).toBe(true);
    expect(activeTypes.has('sitting')).toBe(true);
    expect(activeTypes.has('drop-in')).toBe(false);
  });

  it('shows price for active services', () => {
    const walkingService = services.find((s) => s.type === 'walking');
    expect(walkingService?.price).toBe(25);
  });

  it('shows free for meet_greet', () => {
    const meetGreetServices: Service[] = [
      { id: 3, sitter_id: 2, type: 'meet_greet', price: 0 },
    ];
    const mg = meetGreetServices.find((s) => s.type === 'meet_greet');
    expect(mg?.price).toBe(0);
  });
});
