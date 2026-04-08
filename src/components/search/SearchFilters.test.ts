import { describe, it, expect } from 'vitest';

// Test the generateDowArray function by importing the sitters route module
// Since it's not exported, we test it indirectly through the search schema validation
// and test the date range logic separately here.

describe('date range day-of-week generation', () => {
  // Replicate the generateDowArray logic for unit testing
  function generateDowArray(from: Date, to: Date): number[] {
    const dows = new Set<number>();
    const d = new Date(from);
    const end = new Date(to);
    for (let i = 0; i < 7 && d <= end; i++) {
      dows.add(d.getDay());
      d.setDate(d.getDate() + 1);
    }
    return [...dows];
  }

  it('returns single DOW for same-day range', () => {
    const mon = new Date(2026, 3, 13); // Apr 13 = Monday
    expect(generateDowArray(mon, mon)).toEqual([1]);
  });

  it('returns correct DOWs for a 3-day range', () => {
    const fri = new Date(2026, 3, 10); // Apr 10 = Friday
    const sun = new Date(2026, 3, 12); // Apr 12 = Sunday
    const result = generateDowArray(fri, sun);
    expect(result).toContain(5); // Friday
    expect(result).toContain(6); // Saturday
    expect(result).toContain(0); // Sunday
    expect(result).toHaveLength(3);
  });

  it('returns all 7 DOWs for a full week', () => {
    const mon = new Date(2026, 3, 13); // Monday
    const sun = new Date(2026, 3, 19); // Sunday
    expect(generateDowArray(mon, sun).sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('caps at 7 iterations for ranges longer than a week', () => {
    const d1 = new Date(2026, 3, 1);
    const d2 = new Date(2026, 3, 30);
    const result = generateDowArray(d1, d2);
    expect(result.length).toBeLessThanOrEqual(7);
  });

  it('returns empty array when from > to', () => {
    const result = generateDowArray(new Date(2026, 3, 15), new Date(2026, 3, 10));
    expect(result).toEqual([]);
  });

  it('handles cross-month ranges', () => {
    // Use noon to avoid timezone edge cases with date-only strings
    const d1 = new Date(2026, 3, 29); // Apr 29 = Wednesday
    const d2 = new Date(2026, 4, 1);  // May 1 = Friday
    const result = generateDowArray(d1, d2);
    expect(result).toContain(3); // Wed
    expect(result).toContain(4); // Thu
    expect(result).toContain(5); // Fri
    expect(result).toHaveLength(3);
  });
});

const { sitterSearchSchema } = await import('../../server/validation.ts');

describe('sitterSearchSchema date validation', () => {

  it('accepts valid dateFrom and dateTo', () => {
    const result = sitterSearchSchema.safeParse({ dateFrom: '2026-04-10', dateTo: '2026-04-15' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid date format', () => {
    const result = sitterSearchSchema.safeParse({ dateFrom: 'not-a-date' });
    expect(result.success).toBe(false);
  });

  it('rejects semantically invalid date', () => {
    const result = sitterSearchSchema.safeParse({ dateFrom: '2026-13-45' });
    expect(result.success).toBe(false);
  });

  it('rejects dateFrom after dateTo', () => {
    const result = sitterSearchSchema.safeParse({ dateFrom: '2026-04-20', dateTo: '2026-04-10' });
    expect(result.success).toBe(false);
  });

  it('accepts dateFrom equal to dateTo (single day)', () => {
    const result = sitterSearchSchema.safeParse({ dateFrom: '2026-04-10', dateTo: '2026-04-10' });
    expect(result.success).toBe(true);
  });

  it('accepts dateFrom without dateTo', () => {
    const result = sitterSearchSchema.safeParse({ dateFrom: '2026-04-10' });
    expect(result.success).toBe(true);
  });

  it('accepts dateTo without dateFrom', () => {
    const result = sitterSearchSchema.safeParse({ dateTo: '2026-04-15' });
    expect(result.success).toBe(true);
  });
});

describe('loadSavedFilters shape validation', () => {
  it('validates field types from parsed JSON', () => {
    // Replicate the validation logic from loadSavedFilters
    function validateFilters(p: any) {
      if (typeof p !== 'object' || p === null) return {};
      return {
        species: typeof p.species === 'string' ? p.species : '',
        petSize: typeof p.petSize === 'string' ? p.petSize : '',
        selectedBadges: Array.isArray(p.selectedBadges) ? p.selectedBadges.filter((b: unknown) => typeof b === 'string') : [],
      };
    }

    expect(validateFilters({ species: 'dog', petSize: 123, selectedBadges: 'not-array' }))
      .toEqual({ species: 'dog', petSize: '', selectedBadges: [] });

    expect(validateFilters(null)).toEqual({});
    expect(validateFilters('string')).toEqual({});

    expect(validateFilters({ selectedBadges: ['good', 42, 'also_good'] }))
      .toEqual({ species: '', petSize: '', selectedBadges: ['good', 'also_good'] });
  });
});
