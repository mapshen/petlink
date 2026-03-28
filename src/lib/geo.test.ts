import { describe, it, expect, vi, beforeEach } from 'vitest';
import { jitterCoords, metersToMiles, fitBoundsFromCoords, reverseGeocode } from './geo.ts';

describe('jitterCoords', () => {
  it('returns coords within maxOffset range of original', () => {
    const result = jitterCoords(37.77, -122.42);
    expect(Math.abs(result.lat - 37.77)).toBeLessThanOrEqual(0.002);
    expect(Math.abs(result.lng - (-122.42))).toBeLessThanOrEqual(0.002);
  });

  it('returns deterministic result for same input', () => {
    const a = jitterCoords(37.77, -122.42);
    const b = jitterCoords(37.77, -122.42);
    expect(a.lat).toBe(b.lat);
    expect(a.lng).toBe(b.lng);
  });

  it('returns different result for different input', () => {
    const a = jitterCoords(37.77, -122.42);
    const b = jitterCoords(40.71, -74.01);
    expect(a.lat).not.toBe(b.lat);
  });

  it('respects custom maxOffset', () => {
    const result = jitterCoords(37.77, -122.42, 0.005);
    expect(Math.abs(result.lat - 37.77)).toBeLessThanOrEqual(0.005);
    expect(Math.abs(result.lng - (-122.42))).toBeLessThanOrEqual(0.005);
  });

  it('does not return original coords (actually jitters)', () => {
    const result = jitterCoords(37.77, -122.42);
    const isJittered = result.lat !== 37.77 || result.lng !== -122.42;
    expect(isJittered).toBe(true);
  });
});

describe('metersToMiles', () => {
  it('returns feet for distances under 1 mile', () => {
    expect(metersToMiles(400)).toBe('1312 ft');
  });

  it('returns miles with 1 decimal for >= 1 mile', () => {
    expect(metersToMiles(3218)).toBe('2.0 mi');
  });

  it('returns miles with decimals', () => {
    expect(metersToMiles(8047)).toBe('5.0 mi');
  });

  it('returns null for undefined', () => {
    expect(metersToMiles(undefined)).toBeNull();
  });

  it('returns null for 0', () => {
    expect(metersToMiles(0)).toBeNull();
  });
});

describe('fitBoundsFromCoords', () => {
  it('returns null for empty array', () => {
    expect(fitBoundsFromCoords([])).toBeNull();
  });

  it('returns padded bounds for single coord', () => {
    const bounds = fitBoundsFromCoords([{ lat: 37.77, lng: -122.42 }]);
    expect(bounds).not.toBeNull();
    const [[s, w], [n, e]] = bounds!;
    expect(s).toBeLessThan(37.77);
    expect(n).toBeGreaterThan(37.77);
    expect(w).toBeLessThan(-122.42);
    expect(e).toBeGreaterThan(-122.42);
  });

  it('returns bounds encompassing all coords', () => {
    const coords = [
      { lat: 37.77, lng: -122.42 },
      { lat: 37.80, lng: -122.40 },
      { lat: 37.75, lng: -122.45 },
    ];
    const bounds = fitBoundsFromCoords(coords);
    expect(bounds).not.toBeNull();
    const [[s, w], [n, e]] = bounds!;
    expect(s).toBeLessThanOrEqual(37.75);
    expect(n).toBeGreaterThanOrEqual(37.80);
    expect(w).toBeLessThanOrEqual(-122.45);
    expect(e).toBeGreaterThanOrEqual(-122.40);
  });
});

describe('reverseGeocode', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns city and state on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        address: { city: 'Portland', state: 'Oregon' },
      }),
    }));
    const result = await reverseGeocode(45.52, -122.68);
    expect(result).toBe('Portland, Oregon');
  });

  it('falls back to town when city is missing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        address: { town: 'Lake Oswego', state: 'Oregon' },
      }),
    }));
    const result = await reverseGeocode(45.42, -122.67);
    expect(result).toBe('Lake Oswego, Oregon');
  });

  it('returns null on fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));
    const result = await reverseGeocode(45.52, -122.68);
    expect(result).toBeNull();
  });

  it('returns null when response is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const result = await reverseGeocode(45.52, -122.68);
    expect(result).toBeNull();
  });

  it('returns null when address has no city/town/state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ address: {} }),
    }));
    const result = await reverseGeocode(45.52, -122.68);
    expect(result).toBeNull();
  });
});
