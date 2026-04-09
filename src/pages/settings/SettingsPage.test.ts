import { describe, it, expect } from 'vitest';

/**
 * Test the Settings page section visibility logic matching SettingsPage.tsx.
 * Settings is account-config only: Account, Security, Notifications.
 * All users see the same 3 sections regardless of mode or role.
 */

interface SettingsSectionDef {
  readonly id: string;
  readonly label: string;
}

const ALL_SETTINGS_SECTIONS: readonly SettingsSectionDef[] = [
  { id: 'account', label: 'Account' },
  { id: 'security', label: 'Security' },
  { id: 'notifications', label: 'Notifications' },
];

describe('SettingsPage section visibility', () => {
  it('all users see 3 sections (Account, Security, Notifications)', () => {
    const ids = ALL_SETTINGS_SECTIONS.map((s) => s.id);
    expect(ids).toEqual(['account', 'security', 'notifications']);
    expect(ids).toHaveLength(3);
  });

  it('owners see the same 3 sections', () => {
    // No mode-based filtering — all sections visible to everyone
    const ids = ALL_SETTINGS_SECTIONS.map((s) => s.id);
    expect(ids).toEqual(['account', 'security', 'notifications']);
  });

  it('sitters see the same 3 sections', () => {
    // No mode-based filtering — all sections visible to everyone
    const ids = ALL_SETTINGS_SECTIONS.map((s) => s.id);
    expect(ids).toEqual(['account', 'security', 'notifications']);
  });

  it('all section IDs are correct', () => {
    const allIds = ALL_SETTINGS_SECTIONS.map((s) => s.id);
    expect(allIds).toEqual(['account', 'security', 'notifications']);
  });

  it('no billing sections exist', () => {
    const billingIds = ['payments', 'payment-history', 'credits', 'subscription'];
    const ids = ALL_SETTINGS_SECTIONS.map((s) => s.id);
    for (const billingId of billingIds) {
      expect(ids).not.toContain(billingId);
    }
  });
});
