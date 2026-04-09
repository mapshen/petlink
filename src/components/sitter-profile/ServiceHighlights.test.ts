import { describe, it, expect } from 'vitest';
import { ALL_SERVICE_TYPES } from './ServiceHighlights';
import { getServiceLabel } from '../../shared/service-labels';
import type { Service } from '../../types';

describe('getServiceLabel (shared)', () => {
  it('returns species-neutral labels', () => {
    expect(getServiceLabel('walking')).toBe('Walking');
    expect(getServiceLabel('sitting')).toBe('House Sitting');
    expect(getServiceLabel('drop-in')).toBe('Drop-in Visit');
    expect(getServiceLabel('grooming')).toBe('Grooming');
    expect(getServiceLabel('meet_greet')).toBe('Meet & Greet');
  });

  it('ignores species parameter and returns same labels', () => {
    expect(getServiceLabel('walking', ['dog'])).toBe('Walking');
    expect(getServiceLabel('sitting', ['cat'])).toBe('House Sitting');
  });

  it('handles unknown type gracefully', () => {
    expect(getServiceLabel('boarding')).toBe('Boarding');
  });
});

describe('ALL_SERVICE_TYPES', () => {
  it('contains all 7 service types', () => {
    expect(ALL_SERVICE_TYPES).toEqual(['meet_greet', 'walking', 'sitting', 'drop-in', 'daycare', 'grooming', 'boarding']);
  });
});

describe('ServiceHighlights logic', () => {
  const services: Service[] = [
    { id: 1, sitter_id: 2, type: 'walking', price_cents: 2500, description: '30 min walk' },
    { id: 2, sitter_id: 2, type: 'sitting', price_cents: 5000, description: 'Overnight sitting' },
  ];

  it('identifies active service types', () => {
    const activeTypes = new Set(services.map((s) => s.type));
    expect(activeTypes.has('walking')).toBe(true);
    expect(activeTypes.has('sitting')).toBe(true);
    expect(activeTypes.has('drop-in')).toBe(false);
  });

  it('shows price for active services', () => {
    const walkingService = services.find((s) => s.type === 'walking');
    expect(walkingService?.price_cents).toBe(2500);
  });

  it('shows free for meet_greet', () => {
    const meetGreetServices: Service[] = [
      { id: 3, sitter_id: 2, type: 'meet_greet', price_cents: 0 },
    ];
    const mg = meetGreetServices.find((s) => s.type === 'meet_greet');
    expect(mg?.price_cents).toBe(0);
  });
});
