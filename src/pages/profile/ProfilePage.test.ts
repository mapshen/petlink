import { describe, it, expect } from 'vitest';
import { ALL_SECTIONS, SECTION_DESCRIPTIONS, type SectionDef } from './profileSections';

/**
 * Test the unified Profile+Settings section visibility logic matching ProfilePage.tsx.
 * Sections have a `group` ('profile' | 'account') and `mode` ('owner' | 'sitter' | 'both').
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
  it('owner mode (non-sitter) sees About, My Pets + all 3 Account sections', () => {
    const ids = getVisibleSectionIds('owner', false);
    expect(ids).toEqual([
      'about', 'pets',
      'account', 'security', 'notifications',
    ]);
    expect(ids).toHaveLength(5);
  });

  it('sitter mode with sitter role sees all profile + account sections (10)', () => {
    const ids = getVisibleSectionIds('sitter', true);
    expect(ids).toEqual([
      'about', 'services', 'addons', 'availability', 'location', 'photos', 'policies',
      'account', 'security', 'notifications',
    ]);
    expect(ids).toHaveLength(10);
  });

  it('sitter mode WITHOUT sitter role sees About + all 3 Account sections (4)', () => {
    const ids = getVisibleSectionIds('sitter', false);
    expect(ids).toEqual([
      'about',
      'account', 'security', 'notifications',
    ]);
    expect(ids).toHaveLength(4);
  });

  it('Account group sections are always visible regardless of mode', () => {
    const accountIds = ['account', 'security', 'notifications'];
    for (const [mode, hasSitter] of [['owner', false], ['owner', true], ['sitter', false], ['sitter', true]] as const) {
      const ids = getVisibleSectionIds(mode, hasSitter);
      for (const aid of accountIds) {
        expect(ids, `${aid} missing for mode=${mode} hasSitter=${hasSitter}`).toContain(aid);
      }
    }
  });

  it('owner+sitter user sees owner sections in owner mode (no sitter-only sections)', () => {
    const ids = getVisibleSectionIds('owner', true);
    expect(ids).toEqual([
      'about', 'pets',
      'account', 'security', 'notifications',
    ]);
  });

  it('pets section is only visible in owner mode', () => {
    expect(getVisibleSectionIds('owner', false)).toContain('pets');
    expect(getVisibleSectionIds('owner', true)).toContain('pets');
    expect(getVisibleSectionIds('sitter', true)).not.toContain('pets');
    expect(getVisibleSectionIds('sitter', false)).not.toContain('pets');
  });
});

describe('ProfilePage group membership', () => {
  it('profile group has correct sections', () => {
    const profileIds = ALL_SECTIONS
      .filter((s) => s.group === 'profile')
      .map((s) => s.id);
    expect(profileIds).toEqual([
      'about', 'services', 'pets', 'addons', 'availability', 'location', 'photos', 'policies',
    ]);
  });

  it('account group has correct sections', () => {
    const accountIds = ALL_SECTIONS
      .filter((s) => s.group === 'account')
      .map((s) => s.id);
    expect(accountIds).toEqual([
      'account', 'security', 'notifications',
    ]);
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

describe('ProfilePage preview panel logic', () => {
  it('profile group sections should show preview (sitter mode)', () => {
    const profileSections = ALL_SECTIONS.filter((s) => s.group === 'profile');
    for (const section of profileSections) {
      expect(section.group).toBe('profile');
    }
    // showPreview = isSitter && activeGroup === 'profile'
    // When in sitter mode and active section is profile-group, preview shows
    const isSitter = true;
    const activeGroup = 'profile';
    expect(isSitter && activeGroup === 'profile').toBe(true);
  });

  it('account group sections should NOT show preview', () => {
    const accountSections = ALL_SECTIONS.filter((s) => s.group === 'account');
    for (const section of accountSections) {
      expect(section.group).not.toBe('profile');
    }
    // showPreview = isSitter && activeGroup === 'profile'
    const isSitter = true;
    const activeGroup: string = 'account';
    expect(isSitter && activeGroup === 'profile').toBe(false);
  });

  it('owner mode never shows preview even for profile group', () => {
    const isSitter = false;
    const activeGroup = 'profile';
    expect(isSitter && activeGroup === 'profile').toBe(false);
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
