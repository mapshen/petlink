import { describe, it, expect } from 'vitest';

// Test pure logic extracted from MobileMenu behavior

interface NavItem {
  readonly name: string;
  readonly path: string;
}

function isNavItemActive(itemPath: string, currentPath: string): boolean {
  return currentPath === itemPath;
}

function getVisibleNavItems(
  baseItems: readonly NavItem[],
  user: { is_admin?: boolean } | null
): readonly NavItem[] {
  const items = [...baseItems];
  if (user) {
    items.push({ name: 'Wallet', path: '/wallet' });
  }
  if (user?.is_admin) {
    items.push({ name: 'Admin', path: '/admin' });
  }
  return items;
}

describe('MobileMenu nav item logic', () => {
  const baseItems: NavItem[] = [
    { name: 'Search', path: '/search' },
    { name: 'Home', path: '/home' },
    { name: 'Messages', path: '/messages' },
  ];

  describe('isNavItemActive', () => {
    it('returns true when paths match', () => {
      expect(isNavItemActive('/search', '/search')).toBe(true);
    });

    it('returns false when paths differ', () => {
      expect(isNavItemActive('/search', '/home')).toBe(false);
    });

    it('does not match partial paths', () => {
      expect(isNavItemActive('/search', '/search/results')).toBe(false);
    });
  });

  describe('getVisibleNavItems', () => {
    it('shows base items when no user logged in', () => {
      const items = getVisibleNavItems(baseItems, null);
      expect(items).toHaveLength(3);
      expect(items.map((i) => i.name)).toEqual(['Search', 'Home', 'Messages']);
    });

    it('includes Wallet for logged-in user', () => {
      const items = getVisibleNavItems(baseItems, {});
      expect(items).toHaveLength(4);
      expect(items[3].name).toBe('Wallet');
    });

    it('includes Admin for admin user', () => {
      const items = getVisibleNavItems(baseItems, { is_admin: true });
      expect(items).toHaveLength(5);
      expect(items[4].name).toBe('Admin');
    });

    it('does not include Admin for non-admin user', () => {
      const items = getVisibleNavItems(baseItems, { is_admin: false });
      expect(items).toHaveLength(4);
      expect(items.find((i) => i.name === 'Admin')).toBeUndefined();
    });
  });
});
