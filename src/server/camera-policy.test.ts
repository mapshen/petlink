import { describe, it, expect } from 'vitest';
import { updateProfileSchema } from './validation.ts';
import { getCameraGuidelines, CAMERA_LOCATIONS, CAMERA_LOCATION_LABELS, CAMERA_PREFERENCE_LABELS } from '../shared/camera-guidelines.ts';

describe('camera policy validation', () => {
  const baseProfile = {
    name: 'Test User',
  };

  describe('owner camera fields', () => {
    it('accepts has_cameras boolean', () => {
      const result = updateProfileSchema.safeParse({
        ...baseProfile,
        has_cameras: true,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.has_cameras).toBe(true);
      }
    });

    it('accepts has_cameras as false', () => {
      const result = updateProfileSchema.safeParse({
        ...baseProfile,
        has_cameras: false,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.has_cameras).toBe(false);
      }
    });

    it('accepts valid camera_locations array', () => {
      const result = updateProfileSchema.safeParse({
        ...baseProfile,
        camera_locations: ['living_room', 'backyard'],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.camera_locations).toEqual(['living_room', 'backyard']);
      }
    });

    it('rejects invalid camera_locations values', () => {
      const result = updateProfileSchema.safeParse({
        ...baseProfile,
        camera_locations: ['living_room', 'basement_dungeon'],
      });
      expect(result.success).toBe(false);
    });

    it('accepts all valid camera locations', () => {
      const result = updateProfileSchema.safeParse({
        ...baseProfile,
        camera_locations: [...CAMERA_LOCATIONS],
      });
      expect(result.success).toBe(true);
    });

    it('accepts camera_policy_note string', () => {
      const result = updateProfileSchema.safeParse({
        ...baseProfile,
        camera_policy_note: 'Cameras are in common areas only, not in bedrooms.',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.camera_policy_note).toBe('Cameras are in common areas only, not in bedrooms.');
      }
    });

    it('rejects camera_policy_note exceeding 500 chars', () => {
      const result = updateProfileSchema.safeParse({
        ...baseProfile,
        camera_policy_note: 'x'.repeat(501),
      });
      expect(result.success).toBe(false);
    });

    it('accepts null/undefined camera fields', () => {
      const result = updateProfileSchema.safeParse({
        ...baseProfile,
        has_cameras: null,
        camera_locations: undefined,
        camera_policy_note: null,
      });
      expect(result.success).toBe(true);
    });

    it('accepts empty camera_locations array', () => {
      const result = updateProfileSchema.safeParse({
        ...baseProfile,
        camera_locations: [],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('sitter camera_preference field', () => {
    it('accepts "requires" preference', () => {
      const result = updateProfileSchema.safeParse({
        ...baseProfile,
        camera_preference: 'requires',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.camera_preference).toBe('requires');
      }
    });

    it('accepts "prefers" preference', () => {
      const result = updateProfileSchema.safeParse({
        ...baseProfile,
        camera_preference: 'prefers',
      });
      expect(result.success).toBe(true);
    });

    it('accepts "no_preference" preference', () => {
      const result = updateProfileSchema.safeParse({
        ...baseProfile,
        camera_preference: 'no_preference',
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid camera_preference value', () => {
      const result = updateProfileSchema.safeParse({
        ...baseProfile,
        camera_preference: 'demands',
      });
      expect(result.success).toBe(false);
    });

    it('accepts null camera_preference', () => {
      const result = updateProfileSchema.safeParse({
        ...baseProfile,
        camera_preference: null,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('combined camera fields', () => {
    it('accepts all camera fields together', () => {
      const result = updateProfileSchema.safeParse({
        ...baseProfile,
        has_cameras: true,
        camera_locations: ['living_room', 'backyard', 'kitchen'],
        camera_policy_note: 'Indoor cameras only, turned off at night.',
        camera_preference: 'prefers',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.has_cameras).toBe(true);
        expect(result.data.camera_locations).toEqual(['living_room', 'backyard', 'kitchen']);
        expect(result.data.camera_policy_note).toBe('Indoor cameras only, turned off at night.');
        expect(result.data.camera_preference).toBe('prefers');
      }
    });
  });
});

describe('camera guidelines', () => {
  it('provides best practices content', () => {
    const guidelines = getCameraGuidelines();
    expect(guidelines).toHaveLength(5);
    expect(guidelines[0]).toHaveProperty('title');
    expect(guidelines[0]).toHaveProperty('description');
    expect(guidelines[0]).toHaveProperty('icon');
  });

  it('has labels for all camera locations', () => {
    for (const loc of CAMERA_LOCATIONS) {
      expect(CAMERA_LOCATION_LABELS[loc]).toBeDefined();
      expect(typeof CAMERA_LOCATION_LABELS[loc]).toBe('string');
    }
  });

  it('has labels for all camera preferences', () => {
    for (const pref of ['requires', 'prefers', 'no_preference']) {
      expect(CAMERA_PREFERENCE_LABELS[pref]).toBeDefined();
    }
  });

  it('defines 8 camera locations', () => {
    expect(CAMERA_LOCATIONS).toHaveLength(8);
  });
});
