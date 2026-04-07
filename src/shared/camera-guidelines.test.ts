import { describe, it, expect } from 'vitest';
import {
  getCameraGuidelines,
  CAMERA_LOCATIONS,
  CAMERA_LOCATION_LABELS,
  CAMERA_PREFERENCE_LABELS,
  type CameraLocation,
} from './camera-guidelines.ts';

describe('camera-guidelines', () => {
  describe('getCameraGuidelines', () => {
    it('returns 5 guidelines', () => {
      expect(getCameraGuidelines()).toHaveLength(5);
    });

    it('each guideline has title, description, and icon', () => {
      for (const g of getCameraGuidelines()) {
        expect(g.title).toBeTruthy();
        expect(g.description).toBeTruthy();
        expect(g.icon).toBeTruthy();
      }
    });

    it('returns new array each call (immutability)', () => {
      const a = getCameraGuidelines();
      const b = getCameraGuidelines();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  describe('CAMERA_LOCATIONS', () => {
    it('contains 8 locations', () => {
      expect(CAMERA_LOCATIONS).toHaveLength(8);
    });

    it('includes expected locations', () => {
      expect(CAMERA_LOCATIONS).toContain('living_room');
      expect(CAMERA_LOCATIONS).toContain('backyard');
      expect(CAMERA_LOCATIONS).toContain('kitchen');
      expect(CAMERA_LOCATIONS).toContain('front_door');
    });
  });

  describe('CAMERA_LOCATION_LABELS', () => {
    it('has a human-readable label for every location', () => {
      for (const loc of CAMERA_LOCATIONS) {
        const label = CAMERA_LOCATION_LABELS[loc as CameraLocation];
        expect(label).toBeTruthy();
        // Label should be title case / human readable
        expect(label.length).toBeGreaterThan(2);
      }
    });
  });

  describe('CAMERA_PREFERENCE_LABELS', () => {
    it('has labels for all preference values', () => {
      expect(CAMERA_PREFERENCE_LABELS.requires).toBe('Requires cameras');
      expect(CAMERA_PREFERENCE_LABELS.prefers).toBe('Prefers cameras');
      expect(CAMERA_PREFERENCE_LABELS.no_preference).toBe('No preference');
    });
  });
});
