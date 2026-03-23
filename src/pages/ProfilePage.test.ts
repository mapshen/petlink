import { describe, it, expect } from 'vitest';

// Test the section visibility logic extracted from ProfilePage.
// ProfilePage renders sections based on mode, not role directly.

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
];

function getVisibleSections(mode: 'owner' | 'sitter'): SectionDef[] {
  return ALL_SECTIONS.filter((s) => s.mode === 'both' || s.mode === mode);
}

function getVisibleSectionIds(mode: 'owner' | 'sitter'): string[] {
  return getVisibleSections(mode).map((s) => s.id);
}

describe('ProfilePage section visibility', () => {
  it('owner mode shows profile and pets', () => {
    expect(getVisibleSectionIds('owner')).toEqual(['profile', 'pets']);
  });

  it('sitter mode shows profile, services, and photos', () => {
    expect(getVisibleSectionIds('sitter')).toEqual(['profile', 'services', 'photos']);
  });

  it('profile section is always visible', () => {
    expect(getVisibleSectionIds('owner')).toContain('profile');
    expect(getVisibleSectionIds('sitter')).toContain('profile');
  });

  it('pets section is only visible in owner mode', () => {
    expect(getVisibleSectionIds('owner')).toContain('pets');
    expect(getVisibleSectionIds('sitter')).not.toContain('pets');
  });

  it('services section is only visible in sitter mode', () => {
    expect(getVisibleSectionIds('sitter')).toContain('services');
    expect(getVisibleSectionIds('owner')).not.toContain('services');
  });

  it('photos section is only visible in sitter mode', () => {
    expect(getVisibleSectionIds('sitter')).toContain('photos');
    expect(getVisibleSectionIds('owner')).not.toContain('photos');
  });
});

describe('Dashboard booking filtering logic', () => {
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
