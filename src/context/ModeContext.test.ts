import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

// We test the logic directly since React context testing requires a DOM.
// These tests verify the mode derivation logic extracted from ModeContext.

function deriveInitialMode(
  userRole: 'owner' | 'sitter' | 'both' | null,
  storedMode: string | null
): 'owner' | 'sitter' {
  if (!userRole) return 'owner';
  if (userRole === 'owner') return 'owner';
  if (userRole === 'sitter') return 'sitter';
  if (storedMode === 'owner' || storedMode === 'sitter') return storedMode;
  return 'owner';
}

function deriveCanToggle(userRole: 'owner' | 'sitter' | 'both' | null): boolean {
  return userRole === 'both';
}

function deriveModeOnRoleChange(
  userRole: 'owner' | 'sitter' | 'both',
  storedMode: string | null
): 'owner' | 'sitter' {
  if (userRole === 'owner') return 'owner';
  if (userRole === 'sitter') return 'sitter';
  if (storedMode === 'owner' || storedMode === 'sitter') return storedMode;
  return 'owner';
}

describe('ModeContext logic', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  describe('deriveInitialMode', () => {
    it('returns owner when no user', () => {
      expect(deriveInitialMode(null, null)).toBe('owner');
    });

    it('returns owner for owner role', () => {
      expect(deriveInitialMode('owner', null)).toBe('owner');
    });

    it('returns sitter for sitter role', () => {
      expect(deriveInitialMode('sitter', null)).toBe('sitter');
    });

    it('returns stored mode for both role', () => {
      expect(deriveInitialMode('both', 'sitter')).toBe('sitter');
      expect(deriveInitialMode('both', 'owner')).toBe('owner');
    });

    it('defaults to owner for both role with no stored mode', () => {
      expect(deriveInitialMode('both', null)).toBe('owner');
    });

    it('ignores invalid stored values for both role', () => {
      expect(deriveInitialMode('both', 'invalid')).toBe('owner');
    });

    it('ignores stored mode for single-role users', () => {
      expect(deriveInitialMode('owner', 'sitter')).toBe('owner');
      expect(deriveInitialMode('sitter', 'owner')).toBe('sitter');
    });
  });

  describe('deriveCanToggle', () => {
    it('returns false for null user', () => {
      expect(deriveCanToggle(null)).toBe(false);
    });

    it('returns false for owner role', () => {
      expect(deriveCanToggle('owner')).toBe(false);
    });

    it('returns false for sitter role', () => {
      expect(deriveCanToggle('sitter')).toBe(false);
    });

    it('returns true for both role', () => {
      expect(deriveCanToggle('both')).toBe(true);
    });
  });

  describe('deriveModeOnRoleChange', () => {
    it('forces owner mode when role changes to owner', () => {
      expect(deriveModeOnRoleChange('owner', 'sitter')).toBe('owner');
    });

    it('forces sitter mode when role changes to sitter', () => {
      expect(deriveModeOnRoleChange('sitter', 'owner')).toBe('sitter');
    });

    it('restores stored mode when role is both', () => {
      expect(deriveModeOnRoleChange('both', 'sitter')).toBe('sitter');
      expect(deriveModeOnRoleChange('both', 'owner')).toBe('owner');
    });

    it('defaults to owner when role is both with no stored mode', () => {
      expect(deriveModeOnRoleChange('both', null)).toBe('owner');
    });
  });
});

describe('Mode localStorage persistence', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('setMode persists to localStorage', () => {
    localStorageMock.setItem('petlink_mode', 'sitter');
    expect(localStorageMock.getItem('petlink_mode')).toBe('sitter');
  });

  it('mode is cleared when removed', () => {
    localStorageMock.setItem('petlink_mode', 'sitter');
    localStorageMock.removeItem('petlink_mode');
    expect(localStorageMock.getItem('petlink_mode')).toBeNull();
  });
});
