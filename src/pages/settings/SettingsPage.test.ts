import { describe, it, expect } from 'vitest';

/**
 * Test the Settings page section visibility logic matching SettingsPage.tsx.
 * Mirrors the filtering logic: 'both' sections always visible,
 * 'sitter' sections only visible when mode=sitter AND user has sitter role.
 */

interface SettingsSectionDef {
  readonly id: string;
  readonly label: string;
  readonly group: 'account' | 'billing';
  readonly mode: 'owner' | 'sitter' | 'both';
}

const ALL_SETTINGS_SECTIONS: readonly SettingsSectionDef[] = [
  { id: 'account', label: 'Account', group: 'account', mode: 'both' },
  { id: 'security', label: 'Security', group: 'account', mode: 'both' },
  { id: 'notifications', label: 'Notifications', group: 'account', mode: 'both' },
  { id: 'payments', label: 'Payments', group: 'billing', mode: 'both' },
  { id: 'payment-history', label: 'Payment History', group: 'billing', mode: 'both' },
  { id: 'credits', label: 'Credits', group: 'billing', mode: 'both' },
  { id: 'subscription', label: 'Subscription', group: 'billing', mode: 'sitter' },
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
  it('all users see 6 base sections (Account + Billing without Subscription)', () => {
    const ids = getVisibleSectionIds('owner', false);
    expect(ids).toEqual(['account', 'security', 'notifications', 'payments', 'payment-history', 'credits']);
    expect(ids).toHaveLength(6);
  });

  it('sitter mode with sitter role sees 7 sections (adds Subscription)', () => {
    const ids = getVisibleSectionIds('sitter', true);
    expect(ids).toEqual([
      'account', 'security', 'notifications', 'payments', 'payment-history', 'credits', 'subscription',
    ]);
    expect(ids).toHaveLength(7);
  });

  it('owner mode sees 6 sections (no Subscription)', () => {
    const ids = getVisibleSectionIds('owner', true);
    expect(ids).toEqual(['account', 'security', 'notifications', 'payments', 'payment-history', 'credits']);
    expect(ids).toHaveLength(6);
  });

  it('sitter mode WITHOUT sitter role sees 6 sections (no Subscription)', () => {
    const ids = getVisibleSectionIds('sitter', false);
    expect(ids).toEqual(['account', 'security', 'notifications', 'payments', 'payment-history', 'credits']);
    expect(ids).toHaveLength(6);
  });

  it('all section IDs are correct', () => {
    const allIds = ALL_SETTINGS_SECTIONS.map((s) => s.id);
    expect(allIds).toEqual([
      'account', 'security', 'notifications', 'payments', 'payment-history', 'credits', 'subscription',
    ]);
  });

  it('account group contains 3 sections', () => {
    const accountSections = ALL_SETTINGS_SECTIONS.filter((s) => s.group === 'account');
    expect(accountSections).toHaveLength(3);
    expect(accountSections.map((s) => s.id)).toEqual(['account', 'security', 'notifications']);
  });

  it('billing group contains 4 sections', () => {
    const billingSections = ALL_SETTINGS_SECTIONS.filter((s) => s.group === 'billing');
    expect(billingSections).toHaveLength(4);
    expect(billingSections.map((s) => s.id)).toEqual(['payments', 'payment-history', 'credits', 'subscription']);
  });
});
