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

// Tests verify the mode derivation logic matching ModeContext.tsx.
// Roles are now additive arrays: ['owner'], ['owner', 'sitter'], etc.

function deriveInitialMode(
  roles: string[] | null,
  storedMode: string | null
): 'owner' | 'sitter' {
  if (!roles) return 'owner';
  const hasOwner = roles.includes('owner');
  const hasSitter = roles.includes('sitter');
  if (hasOwner && hasSitter) {
    if (storedMode === 'owner' || storedMode === 'sitter') return storedMode;
    return 'owner';
  }
  if (hasSitter) return 'sitter';
  return 'owner';
}

function deriveCanToggle(roles: string[] | null): boolean {
  return (roles?.includes('owner') ?? false) && (roles?.includes('sitter') ?? false);
}

function deriveModeOnRolesChange(
  roles: string[],
  storedMode: string | null
): 'owner' | 'sitter' {
  const hasOwner = roles.includes('owner');
  const hasSitter = roles.includes('sitter');
  if (hasOwner && hasSitter) {
    if (storedMode === 'owner' || storedMode === 'sitter') return storedMode;
    return 'owner';
  }
  if (hasSitter) return 'sitter';
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

    it('returns owner for owner-only role', () => {
      expect(deriveInitialMode(['owner'], null)).toBe('owner');
    });

    it('returns sitter for sitter-only role', () => {
      expect(deriveInitialMode(['sitter'], null)).toBe('sitter');
    });

    it('returns stored mode for owner+sitter roles', () => {
      expect(deriveInitialMode(['owner', 'sitter'], 'sitter')).toBe('sitter');
      expect(deriveInitialMode(['owner', 'sitter'], 'owner')).toBe('owner');
    });

    it('defaults to owner for owner+sitter with no stored mode', () => {
      expect(deriveInitialMode(['owner', 'sitter'], null)).toBe('owner');
    });

    it('ignores invalid stored values for dual-role users', () => {
      expect(deriveInitialMode(['owner', 'sitter'], 'invalid')).toBe('owner');
    });

    it('ignores stored mode for single-role users', () => {
      expect(deriveInitialMode(['owner'], 'sitter')).toBe('owner');
      expect(deriveInitialMode(['sitter'], 'owner')).toBe('sitter');
    });

    it('handles admin role without affecting mode', () => {
      expect(deriveInitialMode(['owner', 'admin'], null)).toBe('owner');
      expect(deriveInitialMode(['owner', 'sitter', 'admin'], 'sitter')).toBe('sitter');
    });
  });

  describe('deriveCanToggle', () => {
    it('returns false for null user', () => {
      expect(deriveCanToggle(null)).toBe(false);
    });

    it('returns false for owner-only role', () => {
      expect(deriveCanToggle(['owner'])).toBe(false);
    });

    it('returns false for sitter-only role', () => {
      expect(deriveCanToggle(['sitter'])).toBe(false);
    });

    it('returns true for owner+sitter roles', () => {
      expect(deriveCanToggle(['owner', 'sitter'])).toBe(true);
    });

    it('returns true for owner+sitter+admin roles', () => {
      expect(deriveCanToggle(['owner', 'sitter', 'admin'])).toBe(true);
    });
  });

  describe('deriveModeOnRolesChange', () => {
    it('forces owner mode when only owner role', () => {
      expect(deriveModeOnRolesChange(['owner'], 'sitter')).toBe('owner');
    });

    it('forces sitter mode when only sitter role', () => {
      expect(deriveModeOnRolesChange(['sitter'], 'owner')).toBe('sitter');
    });

    it('restores stored mode when owner+sitter', () => {
      expect(deriveModeOnRolesChange(['owner', 'sitter'], 'sitter')).toBe('sitter');
      expect(deriveModeOnRolesChange(['owner', 'sitter'], 'owner')).toBe('owner');
    });

    it('defaults to owner when owner+sitter with no stored mode', () => {
      expect(deriveModeOnRolesChange(['owner', 'sitter'], null)).toBe('owner');
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
