import { describe, it, expect } from 'vitest';
import { isNavActive } from './Layout';

interface NavItem {
  readonly name: string;
  readonly path: string;
}

function getVisibleNavItems(
  user: { is_admin?: boolean } | null
): readonly NavItem[] {
  if (user) {
    const items: NavItem[] = [
      { name: 'Home', path: '/home' },
      { name: 'Search', path: '/search' },
      { name: 'Messages', path: '/messages' },
      { name: 'Wallet', path: '/wallet' },
    ];
    if (user.is_admin) {
      items.push({ name: 'Admin', path: '/admin' });
    }
    return items;
  }
  return [
    { name: 'Search', path: '/search' },
    { name: 'How It Works', path: '/how-it-works' },
  ];
}

describe('MobileMenu nav item logic', () => {
  describe('isNavActive', () => {
    it('returns true when paths match exactly', () => {
      expect(isNavActive('/search', 'Search', '/search')).toBe(true);
    });

    it('returns false when paths differ', () => {
      expect(isNavActive('/search', 'Search', '/home')).toBe(false);
    });

    it('does not match partial paths for non-Profile items', () => {
      expect(isNavActive('/search', 'Search', '/search/results')).toBe(false);
    });

    it('matches /owner/* paths for Profile nav item', () => {
      expect(isNavActive('/owner/jessica-r', 'Profile', '/owner/jessica-r')).toBe(true);
      expect(isNavActive('/profile', 'Profile', '/owner/jessica-r')).toBe(true);
    });

    it('matches /sitter/* paths for Profile nav item', () => {
      expect(isNavActive('/sitter/sarah-m', 'Profile', '/sitter/sarah-m')).toBe(true);
      expect(isNavActive('/profile', 'Profile', '/sitter/sarah-m')).toBe(true);
    });

    it('does not match /owner/* for non-Profile items', () => {
      expect(isNavActive('/home', 'Home', '/owner/jessica-r')).toBe(false);
    });
  });

  describe('getVisibleNavItems', () => {
    it('shows Search and How It Works for non-logged-in users', () => {
      const items = getVisibleNavItems(null);
      expect(items).toHaveLength(2);
      expect(items.map((i) => i.name)).toEqual(['Search', 'How It Works']);
    });

    it('shows Home, Search, Messages, Wallet for logged-in user', () => {
      const items = getVisibleNavItems({});
      expect(items).toHaveLength(4);
      expect(items.map((i) => i.name)).toEqual(['Home', 'Search', 'Messages', 'Wallet']);
    });

    it('includes Admin for admin user', () => {
      const items = getVisibleNavItems({ is_admin: true });
      expect(items).toHaveLength(5);
      expect(items[4].name).toBe('Admin');
    });

    it('does not include Admin for non-admin user', () => {
      const items = getVisibleNavItems({ is_admin: false });
      expect(items).toHaveLength(4);
      expect(items.find((i) => i.name === 'Admin')).toBeUndefined();
    });

    it('Home is first for logged-in users', () => {
      const items = getVisibleNavItems({});
      expect(items[0].name).toBe('Home');
    });

    it('Search is first for non-logged-in users', () => {
      const items = getVisibleNavItems(null);
      expect(items[0].name).toBe('Search');
    });
  });
});
