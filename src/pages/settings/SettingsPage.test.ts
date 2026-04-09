import { describe, it, expect } from 'vitest';

/**
 * Test the Settings page section visibility logic matching SettingsPage.tsx.
 * Mirrors the filtering logic: 'both' sections always visible,
 * 'sitter' sections only visible when mode=sitter AND user has sitter role.
 */

interface SettingsSectionDef {
  readonly id: string;
  readonly label: string;
  readonly mode: 'owner' | 'sitter' | 'both';
}

const ALL_SETTINGS_SECTIONS: readonly SettingsSectionDef[] = [
  { id: 'account', label: 'Account', mode: 'both' },
  { id: 'security', label: 'Security', mode: 'both' },
  { id: 'notifications', label: 'Notifications', mode: 'both' },
  { id: 'payment-methods', label: 'Payments', mode: 'both' },
  { id: 'subscription', label: 'Subscription', mode: 'sitter' },
];

function getVisibleSections(
  mode: 'owner' | 'sitter',
  hasSitterRole: boolean,
): SettingsSectionDef[] {
  const isSitter = mode === 'sitter' && hasSitterRole;
  return ALL_SETTINGS_SECTIONS.filter((s) => {
    if (s.mode === 'both') return true;
    if (s.mode === 'sitter') return isSitter;
    return false;
  });
}

function getVisibleSectionIds(
  mode: 'owner' | 'sitter',
  hasSitterRole: boolean,
): string[] {
  return getVisibleSections(mode, hasSitterRole).map((s) => s.id);
}

describe('SettingsPage section visibility', () => {
  it('all users see 4 base sections (Account, Security, Notifications, Payments)', () => {
    const ids = getVisibleSectionIds('owner', false);
    expect(ids).toEqual(['account', 'security', 'notifications', 'payment-methods']);
    expect(ids).toHaveLength(4);
  });

  it('sitter mode with sitter role sees 5 sections (adds Subscription)', () => {
    const ids = getVisibleSectionIds('sitter', true);
    expect(ids).toEqual([
      'account', 'security', 'notifications', 'payment-methods', 'subscription',
    ]);
    expect(ids).toHaveLength(5);
  });

  it('owner mode sees 4 sections (no Subscription)', () => {
    const ids = getVisibleSectionIds('owner', true);
    expect(ids).toEqual(['account', 'security', 'notifications', 'payment-methods']);
    expect(ids).toHaveLength(4);
  });

  it('sitter mode WITHOUT sitter role sees 4 sections (no Subscription)', () => {
    const ids = getVisibleSectionIds('sitter', false);
    expect(ids).toEqual(['account', 'security', 'notifications', 'payment-methods']);
    expect(ids).toHaveLength(4);
  });

  it('all section IDs are correct', () => {
    const allIds = ALL_SETTINGS_SECTIONS.map((s) => s.id);
    expect(allIds).toEqual([
      'account', 'security', 'notifications', 'payment-methods', 'subscription',
    ]);
  });
});
