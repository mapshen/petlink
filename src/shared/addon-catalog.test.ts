import { describe, it, expect } from 'vitest';
import {
  ADDON_CATALOG,
  ADDON_SLUGS,
  getAddonBySlug,
  getAddonLabel,
  getAddonShortLabel,
  getAddonEmoji,
  getAddonsForService,
  getAddonsByCategory,
  getAddonsForSpecies,
} from './addon-catalog';

describe('ADDON_CATALOG', () => {
  it('contains 12 add-on definitions', () => {
    expect(ADDON_CATALOG).toHaveLength(12);
  });

  it('has all unique slugs', () => {
    const slugSet = new Set(ADDON_CATALOG.map((a) => a.slug));
    expect(slugSet.size).toBe(ADDON_CATALOG.length);
  });

  it('has non-negative integer defaultPriceCents for every item', () => {
    for (const addon of ADDON_CATALOG) {
      expect(addon.defaultPriceCents).toBeGreaterThanOrEqual(0);
      expect(Number.isInteger(addon.defaultPriceCents)).toBe(true);
    }
  });

  it('every item has a non-empty label, shortLabel, emoji, and description', () => {
    for (const addon of ADDON_CATALOG) {
      expect(addon.label.length).toBeGreaterThan(0);
      expect(addon.shortLabel.length).toBeGreaterThan(0);
      expect(addon.emoji.length).toBeGreaterThan(0);
      expect(addon.description.length).toBeGreaterThan(0);
    }
  });

  it('every item has a valid category', () => {
    const validCategories = ['care', 'grooming', 'convenience', 'training'];
    for (const addon of ADDON_CATALOG) {
      expect(validCategories).toContain(addon.category);
    }
  });
});

describe('ADDON_SLUGS', () => {
  it('is a string array matching catalog length', () => {
    expect(ADDON_SLUGS).toHaveLength(ADDON_CATALOG.length);
    for (const slug of ADDON_SLUGS) {
      expect(typeof slug).toBe('string');
    }
  });

  it('matches the slugs in ADDON_CATALOG in order', () => {
    expect(ADDON_SLUGS).toEqual(ADDON_CATALOG.map((a) => a.slug));
  });
});

describe('getAddonBySlug', () => {
  it('returns correct definition for a known slug', () => {
    const addon = getAddonBySlug('medication_admin');
    expect(addon).toBeDefined();
    expect(addon!.label).toBe('Medication Administration');
    expect(addon!.category).toBe('care');
    expect(addon!.defaultPriceCents).toBe(500);
  });

  it('returns correct definition for another known slug', () => {
    const addon = getAddonBySlug('bathing');
    expect(addon).toBeDefined();
    expect(addon!.label).toBe('Bathing');
    expect(addon!.category).toBe('grooming');
    expect(addon!.species).toEqual(['dog', 'cat']);
  });

  it('returns undefined for an unknown slug', () => {
    expect(getAddonBySlug('nonexistent')).toBeUndefined();
    expect(getAddonBySlug('')).toBeUndefined();
  });
});

describe('getAddonLabel', () => {
  it('returns label for a known slug', () => {
    expect(getAddonLabel('medication_admin')).toBe('Medication Administration');
    expect(getAddonLabel('extended_walk')).toBe('Extended Walk (+30 min)');
  });

  it('returns formatted slug for an unknown slug', () => {
    expect(getAddonLabel('some_unknown_addon')).toBe('some unknown addon');
  });
});

describe('getAddonShortLabel', () => {
  it('returns shortLabel for a known slug', () => {
    expect(getAddonShortLabel('medication_admin')).toBe('Meds');
    expect(getAddonShortLabel('pickup_dropoff')).toBe('Pickup');
    expect(getAddonShortLabel('training_reinforcement')).toBe('Training');
  });

  it('returns formatted slug for an unknown slug', () => {
    expect(getAddonShortLabel('unknown_thing')).toBe('unknown thing');
  });
});

describe('getAddonEmoji', () => {
  it('returns emoji for a known slug', () => {
    expect(getAddonEmoji('bathing')).toBe('\u{1F6C1}');
    expect(getAddonEmoji('medication_admin')).toBe('\u{1F48A}');
    expect(getAddonEmoji('daily_updates')).toBe('\u{1F4F8}');
  });

  it('returns default plus emoji for an unknown slug', () => {
    expect(getAddonEmoji('nonexistent')).toBe('\u{2795}');
  });
});

describe('getAddonsForService', () => {
  it('returns add-ons applicable to walking', () => {
    const walking = getAddonsForService('walking');
    const slugs = walking.map((a) => a.slug);
    expect(slugs).toContain('medication_admin');
    expect(slugs).toContain('puppy_care');
    expect(slugs).toContain('extended_walk');
    expect(slugs).toContain('training_reinforcement');
    expect(slugs).toContain('pickup_dropoff');
  });

  it('excludes bathing from walking', () => {
    const walking = getAddonsForService('walking');
    const slugs = walking.map((a) => a.slug);
    expect(slugs).not.toContain('bathing');
    expect(slugs).not.toContain('nail_trimming');
    expect(slugs).not.toContain('teeth_brushing');
    expect(slugs).not.toContain('full_grooming');
  });

  it('returns add-ons applicable to sitting', () => {
    const sitting = getAddonsForService('sitting');
    const slugs = sitting.map((a) => a.slug);
    expect(slugs).toContain('medication_admin');
    expect(slugs).toContain('bathing');
    expect(slugs).toContain('evening_call');
    expect(slugs).not.toContain('extended_walk');
    expect(slugs).not.toContain('training_reinforcement');
  });

  it('returns add-ons applicable to daycare', () => {
    const daycare = getAddonsForService('daycare');
    const slugs = daycare.map((a) => a.slug);
    expect(slugs).toContain('training_reinforcement');
    expect(slugs).toContain('full_grooming');
    expect(slugs).not.toContain('extended_walk');
    expect(slugs).not.toContain('evening_call');
  });

  it('returns empty array for unknown service type', () => {
    expect(getAddonsForService('unknown')).toEqual([]);
  });
});

describe('getAddonsByCategory', () => {
  it('returns 4 category groups', () => {
    const groups = getAddonsByCategory();
    expect(groups).toHaveLength(4);
  });

  it('groups are in order: care, grooming, convenience, training', () => {
    const groups = getAddonsByCategory();
    expect(groups.map((g) => g.category)).toEqual(['care', 'grooming', 'convenience', 'training']);
  });

  it('each group has a human-readable label', () => {
    const groups = getAddonsByCategory();
    expect(groups.map((g) => g.label)).toEqual(['Care', 'Grooming', 'Convenience', 'Training']);
  });

  it('care group contains 3 add-ons', () => {
    const groups = getAddonsByCategory();
    const care = groups.find((g) => g.category === 'care')!;
    expect(care.addons).toHaveLength(3);
    expect(care.addons.map((a) => a.slug)).toEqual(['medication_admin', 'puppy_care', 'senior_pet_care']);
  });

  it('grooming group contains 4 add-ons', () => {
    const groups = getAddonsByCategory();
    const grooming = groups.find((g) => g.category === 'grooming')!;
    expect(grooming.addons).toHaveLength(4);
  });

  it('training group contains 2 add-ons', () => {
    const groups = getAddonsByCategory();
    const training = groups.find((g) => g.category === 'training')!;
    expect(training.addons).toHaveLength(2);
    expect(training.addons.map((a) => a.slug)).toEqual(['training_reinforcement', 'extended_walk']);
  });

  it('all catalog items are accounted for across groups', () => {
    const groups = getAddonsByCategory();
    const totalAddons = groups.reduce((sum, g) => sum + g.addons.length, 0);
    expect(totalAddons).toBe(ADDON_CATALOG.length);
  });
});

describe('getAddonsForSpecies', () => {
  it('returns all add-ons when no species specified', () => {
    expect(getAddonsForSpecies()).toHaveLength(ADDON_CATALOG.length);
    expect(getAddonsForSpecies(undefined)).toHaveLength(ADDON_CATALOG.length);
  });

  it('returns all add-ons when empty array passed', () => {
    expect(getAddonsForSpecies([])).toHaveLength(ADDON_CATALOG.length);
  });

  it('excludes dog-only add-ons for cat-only sitters', () => {
    const catAddons = getAddonsForSpecies(['cat']);
    const slugs = catAddons.map((a) => a.slug);
    expect(slugs).not.toContain('extended_walk');
    expect(slugs).not.toContain('training_reinforcement');
  });

  it('includes species-all and cat-applicable add-ons for cat sitters', () => {
    const catAddons = getAddonsForSpecies(['cat']);
    const slugs = catAddons.map((a) => a.slug);
    // species: 'all' items
    expect(slugs).toContain('medication_admin');
    expect(slugs).toContain('puppy_care');
    expect(slugs).toContain('pickup_dropoff');
    expect(slugs).toContain('daily_updates');
    // species: ['dog', 'cat'] items
    expect(slugs).toContain('bathing');
    expect(slugs).toContain('teeth_brushing');
  });

  it('includes all add-ons for dog sitters (all are all or include dog)', () => {
    const dogAddons = getAddonsForSpecies(['dog']);
    expect(dogAddons).toHaveLength(ADDON_CATALOG.length);
  });

  it('includes all add-ons for dog+cat sitters', () => {
    const addons = getAddonsForSpecies(['dog', 'cat']);
    expect(addons).toHaveLength(ADDON_CATALOG.length);
  });

  it('excludes grooming add-ons not applicable to birds', () => {
    const birdAddons = getAddonsForSpecies(['bird']);
    const slugs = birdAddons.map((a) => a.slug);
    // species: 'all' items should be included
    expect(slugs).toContain('medication_admin');
    expect(slugs).toContain('daily_updates');
    // species: ['dog', 'cat'] items should be excluded
    expect(slugs).not.toContain('bathing');
    expect(slugs).not.toContain('teeth_brushing');
    // species: ['dog'] items should be excluded
    expect(slugs).not.toContain('extended_walk');
    expect(slugs).not.toContain('training_reinforcement');
  });

  it('includes small_animal-applicable add-ons', () => {
    const addons = getAddonsForSpecies(['small_animal']);
    const slugs = addons.map((a) => a.slug);
    expect(slugs).toContain('nail_trimming');
    expect(slugs).toContain('full_grooming');
    expect(slugs).not.toContain('bathing');
  });

  it('returns a copy, not a reference to the catalog', () => {
    const result = getAddonsForSpecies();
    expect(result).not.toBe(ADDON_CATALOG);
    expect(result).toEqual([...ADDON_CATALOG]);
  });
});
