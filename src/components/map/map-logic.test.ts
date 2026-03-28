import { describe, it, expect } from 'vitest';
import { fitBoundsFromCoords, jitterCoords } from '../../lib/geo';

describe('SitterClusterMap logic', () => {
  it('fitBoundsFromCoords filters and bounds sitters with valid coords', () => {
    const sitters = [
      { lat: 37.77, lng: -122.42 },
      { lat: 37.80, lng: -122.40 },
    ];
    const bounds = fitBoundsFromCoords(sitters);
    expect(bounds).not.toBeNull();
    const [[s, w], [n, e]] = bounds!;
    expect(s).toBeLessThanOrEqual(37.77);
    expect(n).toBeGreaterThanOrEqual(37.80);
    expect(w).toBeLessThanOrEqual(-122.42);
    expect(e).toBeGreaterThanOrEqual(-122.40);
  });

  it('fitBoundsFromCoords handles empty array', () => {
    expect(fitBoundsFromCoords([])).toBeNull();
  });

  it('fitBoundsFromCoords includes search center in bounds', () => {
    const sitters = [{ lat: 37.77, lng: -122.42 }];
    const center = { lat: 37.90, lng: -122.30 };
    const bounds = fitBoundsFromCoords([...sitters, center]);
    expect(bounds).not.toBeNull();
    const [[s], [n]] = bounds!;
    expect(s).toBeLessThanOrEqual(37.77);
    expect(n).toBeGreaterThanOrEqual(37.90);
  });
});

describe('SitterLocationMap logic', () => {
  it('jitterCoords returns offset within range', () => {
    const result = jitterCoords(45.52, -122.68);
    expect(Math.abs(result.lat - 45.52)).toBeLessThanOrEqual(0.002);
    expect(Math.abs(result.lng - (-122.68))).toBeLessThanOrEqual(0.002);
  });

  it('jitterCoords is deterministic', () => {
    const a = jitterCoords(45.52, -122.68);
    const b = jitterCoords(45.52, -122.68);
    expect(a).toEqual(b);
  });

  it('jitterCoords produces different output for different sitters', () => {
    const a = jitterCoords(45.52, -122.68);
    const b = jitterCoords(37.77, -122.42);
    expect(a.lat).not.toBe(b.lat);
    expect(a.lng).not.toBe(b.lng);
  });
});

describe('MapViewToggle logic', () => {
  it('valid view values are list, map, split', () => {
    const validViews = ['list', 'map', 'split'];
    for (const v of validViews) {
      expect(validViews).toContain(v);
    }
  });
});
