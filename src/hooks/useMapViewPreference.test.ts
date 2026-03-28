import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getMapViewPreference, setMapViewPreference, MAP_VIEW_STORAGE_KEY } from './useMapViewPreference.ts';

describe('map view preference', () => {
  let storage: Record<string, string>;

  beforeEach(() => {
    storage = {};
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage[key] ?? null),
      setItem: vi.fn((key: string, value: string) => { storage[key] = value; }),
      removeItem: vi.fn((key: string) => { delete storage[key]; }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns "list" as default when no stored value', () => {
    expect(getMapViewPreference()).toBe('list');
  });

  it('persists value via setMapViewPreference', () => {
    setMapViewPreference('map');
    expect(storage[MAP_VIEW_STORAGE_KEY]).toBe('map');
  });

  it('reads persisted value', () => {
    storage[MAP_VIEW_STORAGE_KEY] = 'split';
    expect(getMapViewPreference()).toBe('split');
  });

  it('ignores invalid stored values', () => {
    storage[MAP_VIEW_STORAGE_KEY] = 'invalid_value';
    expect(getMapViewPreference()).toBe('list');
  });

  it('accepts all valid view types', () => {
    for (const view of ['list', 'map', 'split'] as const) {
      setMapViewPreference(view);
      expect(getMapViewPreference()).toBe(view);
    }
  });
});
