import { describe, it, expect } from 'vitest';

// Test the section visibility logic matching ProfilePage.tsx.
// Sections are filtered by mode AND hasSitter guard.

interface SectionDef {
  id: string;
  label: string;
  mode: 'owner' | 'sitter' | 'both';
}

const ALL_SECTIONS: SectionDef[] = [
  { id: 'profile', label: 'Profile', mode: 'both' },
  { id: 'pets', label: 'My Pets', mode: 'owner' },
  { id: 'services', label: 'Services', mode: 'sitter' },
  { id: 'photos', label: 'Photos', mode: 'sitter' },
  { id: 'reviews', label: 'Reviews', mode: 'sitter' },
];

function getVisibleSections(mode: 'owner' | 'sitter', hasSitter: boolean): SectionDef[] {
  return ALL_SECTIONS.filter(
    (s) => s.mode === 'both' || (s.mode === mode && (s.mode === 'owner' || hasSitter))
  );
}

function getVisibleSectionIds(mode: 'owner' | 'sitter', hasSitter: boolean): string[] {
  return getVisibleSections(mode, hasSitter).map((s) => s.id);
}

describe('ProfilePage section visibility', () => {
  it('owner mode shows profile and pets', () => {
    expect(getVisibleSectionIds('owner', false)).toEqual(['profile', 'pets']);
  });

  it('sitter mode with sitter role shows profile, services, photos, and reviews', () => {
    expect(getVisibleSectionIds('sitter', true)).toEqual(['profile', 'services', 'photos', 'reviews']);
  });

  it('sitter mode WITHOUT sitter role only shows profile (guard)', () => {
    expect(getVisibleSectionIds('sitter', false)).toEqual(['profile']);
  });

  it('profile section is always visible', () => {
    expect(getVisibleSectionIds('owner', false)).toContain('profile');
    expect(getVisibleSectionIds('sitter', true)).toContain('profile');
  });

  it('pets section is only visible in owner mode', () => {
    expect(getVisibleSectionIds('owner', false)).toContain('pets');
    expect(getVisibleSectionIds('sitter', true)).not.toContain('pets');
  });

  it('services section requires sitter mode and sitter role', () => {
    expect(getVisibleSectionIds('sitter', true)).toContain('services');
    expect(getVisibleSectionIds('owner', true)).not.toContain('services');
    expect(getVisibleSectionIds('sitter', false)).not.toContain('services');
  });

  it('owner+sitter user sees owner sections in owner mode', () => {
    expect(getVisibleSectionIds('owner', true)).toEqual(['profile', 'pets']);
  });

  it('owner+sitter user sees sitter sections in sitter mode', () => {
    expect(getVisibleSectionIds('sitter', true)).toEqual(['profile', 'services', 'photos', 'reviews']);
  });
});

describe('Home page booking filtering logic', () => {
  interface Booking {
    id: number;
    sitter_id: number;
    owner_id: number;
  }

  const bookings: Booking[] = [
    { id: 1, sitter_id: 10, owner_id: 20 },
    { id: 2, sitter_id: 20, owner_id: 30 },
    { id: 3, sitter_id: 30, owner_id: 10 },
    { id: 4, sitter_id: 10, owner_id: 30 },
  ];

  function filterBookings(
    allBookings: Booking[],
    userId: number,
    isSitterMode: boolean
  ): Booking[] {
    return allBookings.filter((b) =>
      isSitterMode ? userId === b.sitter_id : userId === b.owner_id
    );
  }

  it('owner mode filters by owner_id', () => {
    const result = filterBookings(bookings, 20, false);
    expect(result.map((b) => b.id)).toEqual([1]);
  });

  it('sitter mode filters by sitter_id', () => {
    const result = filterBookings(bookings, 10, true);
    expect(result.map((b) => b.id)).toEqual([1, 4]);
  });

  it('returns empty array when no matching bookings', () => {
    expect(filterBookings(bookings, 999, false)).toEqual([]);
    expect(filterBookings(bookings, 999, true)).toEqual([]);
  });

  it('same user sees different bookings per mode', () => {
    const asOwner = filterBookings(bookings, 10, false);
    const asSitter = filterBookings(bookings, 10, true);
    expect(asOwner.map((b) => b.id)).toEqual([3]);
    expect(asSitter.map((b) => b.id)).toEqual([1, 4]);
  });
});
