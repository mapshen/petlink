import { describe, it, expect } from 'vitest';
import { updateProfileSchema } from './validation.ts';

describe('updateProfileSchema — service_radius_miles', () => {
  it('accepts valid service_radius_miles', () => {
    const result = updateProfileSchema.safeParse({ name: 'Bob', service_radius_miles: 10 });
    expect(result.success).toBe(true);
  });

  it('accepts null service_radius_miles', () => {
    const result = updateProfileSchema.safeParse({ name: 'Bob', service_radius_miles: null });
    expect(result.success).toBe(true);
  });

  it('accepts omitted service_radius_miles', () => {
    const result = updateProfileSchema.safeParse({ name: 'Bob' });
    expect(result.success).toBe(true);
  });

  it('rejects service_radius_miles < 1', () => {
    const result = updateProfileSchema.safeParse({ name: 'Bob', service_radius_miles: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects service_radius_miles > 100', () => {
    const result = updateProfileSchema.safeParse({ name: 'Bob', service_radius_miles: 101 });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer service_radius_miles', () => {
    const result = updateProfileSchema.safeParse({ name: 'Bob', service_radius_miles: 5.5 });
    expect(result.success).toBe(false);
  });
});
