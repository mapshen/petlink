import { describe, it, expect } from 'vitest';
import { ALL_SECTIONS, SECTION_DESCRIPTIONS, type SectionDef } from './profileSections';

/**
 * Test the Profile page section visibility logic matching ProfilePage.tsx.
 * Profile-only sections (no account group — account sections moved to SettingsPage).
 */

function getVisibleSections(mode: 'owner' | 'sitter', hasSitter: boolean): SectionDef[] {
  return ALL_SECTIONS.filter((s) => {
    if (s.mode === 'both') return true;
    if (s.mode === 'sitter') return mode === 'sitter' && hasSitter;
    if (s.mode === 'owner') return mode !== 'sitter';
    return false;
  });
}

function getVisibleSectionIds(mode: 'owner' | 'sitter', hasSitter: boolean): string[] {
  return getVisibleSections(mode, hasSitter).map((s) => s.id);
}

describe('ProfilePage section visibility', () => {
  it('owner mode (non-sitter) sees About and My Pets (2)', () => {
    const ids = getVisibleSectionIds('owner', false);
    expect(ids).toEqual(['about', 'pets']);
    expect(ids).toHaveLength(2);
  });

  it('sitter mode with sitter role sees all 7 profile sections', () => {
    const ids = getVisibleSectionIds('sitter', true);
    expect(ids).toEqual([
      'about', 'services', 'home_environment', 'availability', 'location', 'photos', 'policies',
    ]);
    expect(ids).toHaveLength(7);
  });

  it('sitter mode WITHOUT sitter role sees About only (1)', () => {
    const ids = getVisibleSectionIds('sitter', false);
    expect(ids).toEqual(['about']);
    expect(ids).toHaveLength(1);
  });

  it('owner+sitter user sees owner sections in owner mode (no sitter-only sections)', () => {
    const ids = getVisibleSectionIds('owner', true);
    expect(ids).toEqual(['about', 'pets']);
  });

  it('pets section is only visible in owner mode', () => {
    expect(getVisibleSectionIds('owner', false)).toContain('pets');
    expect(getVisibleSectionIds('owner', true)).toContain('pets');
    expect(getVisibleSectionIds('sitter', true)).not.toContain('pets');
    expect(getVisibleSectionIds('sitter', false)).not.toContain('pets');
  });

  it('no account sections exist in profile sections', () => {
    const ids = ALL_SECTIONS.map((s) => s.id);
    expect(ids).not.toContain('account');
    expect(ids).not.toContain('security');
    expect(ids).not.toContain('notifications');
  });
});

describe('ProfilePage WYSIWYG redirect logic', () => {
  function getRedirectPath(
    mode: 'owner' | 'sitter',
    hasSitterRole: boolean,
    slug: string | null,
    loading: boolean
  ): string | null {
    const isSitter = mode === 'sitter' && hasSitterRole;
    if (isSitter && slug && !loading) return `/sitter/${slug}`;
    if (!isSitter && slug && !loading) return `/owner/${slug}`;
    return null; // stay on ProfilePage
  }

  it('redirects sitter with slug to /sitter/:slug', () => {
    expect(getRedirectPath('sitter', true, 'sarah-m', false)).toBe('/sitter/sarah-m');
  });

  it('redirects owner with slug to /owner/:slug', () => {
    expect(getRedirectPath('owner', false, 'jessica-r', false)).toBe('/owner/jessica-r');
  });

  it('redirects dual-role user in owner mode to /owner/:slug', () => {
    expect(getRedirectPath('owner', true, 'jessica-r', false)).toBe('/owner/jessica-r');
  });

  it('stays on ProfilePage when no slug', () => {
    expect(getRedirectPath('owner', false, null, false)).toBeNull();
  });

  it('stays on ProfilePage while loading', () => {
    expect(getRedirectPath('owner', false, 'jessica-r', true)).toBeNull();
  });
});

describe('ProfilePage section descriptions', () => {
  it('every section in ALL_SECTIONS has a description', () => {
    for (const section of ALL_SECTIONS) {
      expect(
        SECTION_DESCRIPTIONS[section.id],
        `Missing description for section "${section.id}"`,
      ).toBeDefined();
      expect(SECTION_DESCRIPTIONS[section.id].length).toBeGreaterThan(0);
    }
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
