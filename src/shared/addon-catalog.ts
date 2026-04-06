/**
 * Add-on service catalog — shared between server and client.
 * Sitters pick from this catalog and set custom prices.
 */

import type { ServiceType, PetSpecies } from './service-labels.ts';

export interface AddonDefinition {
  readonly slug: string;
  readonly label: string;
  readonly shortLabel: string;
  readonly description: string;
  readonly emoji: string;
  readonly category: 'care' | 'grooming' | 'convenience' | 'training';
  readonly pricingUnit: string;
  readonly applicableServices: readonly ServiceType[];
  readonly species: readonly PetSpecies[] | 'all';
  readonly canOfferFree: boolean;
  readonly defaultPriceCents: number;
}

export const ADDON_CATALOG: readonly AddonDefinition[] = [
  // Care
  {
    slug: 'medication_admin',
    label: 'Medication Administration',
    shortLabel: 'Meds',
    description: 'Oral, topical, or injectable medication per vet instructions',
    emoji: '💊',
    category: 'care',
    pricingUnit: 'per visit',
    applicableServices: ['walking', 'sitting', 'drop-in', 'daycare', 'grooming'],
    species: 'all',
    canOfferFree: false,
    defaultPriceCents: 500,
  },
  {
    slug: 'puppy_care',
    label: 'Puppy / Kitten Care',
    shortLabel: 'Puppy Care',
    description: 'Extra attention for pets under 1 year — more potty breaks, feeding, supervision',
    emoji: '🐶',
    category: 'care',
    pricingUnit: 'per night',
    applicableServices: ['walking', 'sitting', 'drop-in', 'daycare', 'grooming'],
    species: 'all',
    canOfferFree: false,
    defaultPriceCents: 1000,
  },
  {
    slug: 'senior_pet_care',
    label: 'Senior Pet Care',
    shortLabel: 'Senior Care',
    description: 'Specialized care for elderly pets — mobility assistance, health monitoring',
    emoji: '🧓',
    category: 'care',
    pricingUnit: 'per night',
    applicableServices: ['walking', 'sitting', 'drop-in', 'daycare'],
    species: 'all',
    canOfferFree: false,
    defaultPriceCents: 1000,
  },
  // Grooming
  {
    slug: 'bathing',
    label: 'Bathing',
    shortLabel: 'Bathing',
    description: 'Bath with pet-safe shampoo, towel dry, and brushing',
    emoji: '🛁',
    category: 'grooming',
    pricingUnit: 'per bath',
    applicableServices: ['sitting', 'daycare', 'drop-in'],
    species: ['dog', 'cat'],
    canOfferFree: true,
    defaultPriceCents: 1500,
  },
  {
    slug: 'nail_trimming',
    label: 'Nail Trimming',
    shortLabel: 'Nails',
    description: 'Safe nail clipping for dogs, cats, and small animals',
    emoji: '✂️',
    category: 'grooming',
    pricingUnit: 'per session',
    applicableServices: ['sitting', 'daycare', 'drop-in'],
    species: ['dog', 'cat', 'small_animal'],
    canOfferFree: true,
    defaultPriceCents: 1000,
  },
  {
    slug: 'teeth_brushing',
    label: 'Teeth Brushing',
    shortLabel: 'Teeth',
    description: 'Dental hygiene with pet-safe toothpaste',
    emoji: '🪥',
    category: 'grooming',
    pricingUnit: 'per session',
    applicableServices: ['sitting', 'daycare', 'drop-in'],
    species: ['dog', 'cat'],
    canOfferFree: true,
    defaultPriceCents: 800,
  },
  {
    slug: 'full_grooming',
    label: 'Full Grooming',
    shortLabel: 'Grooming',
    description: 'Complete grooming session — bath, brush, nails, ears, and coat trim',
    emoji: '💇',
    category: 'grooming',
    pricingUnit: 'per session',
    applicableServices: ['sitting', 'daycare'],
    species: ['dog', 'cat', 'small_animal'],
    canOfferFree: false,
    defaultPriceCents: 3500,
  },
  // Convenience
  {
    slug: 'pickup_dropoff',
    label: 'Pickup & Drop-off',
    shortLabel: 'Pickup',
    description: 'Transport pets to and from your home',
    emoji: '🚗',
    category: 'convenience',
    pricingUnit: 'per trip',
    applicableServices: ['sitting', 'daycare', 'walking'],
    species: 'all',
    canOfferFree: false,
    defaultPriceCents: 1500,
  },
  {
    slug: 'daily_updates',
    label: 'Daily Photo & Video Updates',
    shortLabel: 'Updates',
    description: 'Photos and short video clips of your pet throughout the day',
    emoji: '📸',
    category: 'convenience',
    pricingUnit: 'per booking',
    applicableServices: ['sitting', 'daycare', 'drop-in'],
    species: 'all',
    canOfferFree: true,
    defaultPriceCents: 0,
  },
  {
    slug: 'evening_call',
    label: 'Evening Update Call',
    shortLabel: 'Evening Call',
    description: 'Nightly phone or video check-in for overnight stays',
    emoji: '📞',
    category: 'convenience',
    pricingUnit: 'per night',
    applicableServices: ['sitting'],
    species: 'all',
    canOfferFree: true,
    defaultPriceCents: 0,
  },
  // Training (dogs only)
  {
    slug: 'training_reinforcement',
    label: 'Training Reinforcement',
    shortLabel: 'Training',
    description: 'Practice basic commands and manners during walks or stays',
    emoji: '🎓',
    category: 'training',
    pricingUnit: 'per session',
    applicableServices: ['walking', 'daycare'],
    species: ['dog'],
    canOfferFree: false,
    defaultPriceCents: 1500,
  },
  {
    slug: 'extended_walk',
    label: 'Extended Walk (+30 min)',
    shortLabel: 'Extended Walk',
    description: 'Double the standard walk time for high-energy dogs',
    emoji: '🚶',
    category: 'training',
    pricingUnit: 'per walk',
    applicableServices: ['walking'],
    species: ['dog'],
    canOfferFree: false,
    defaultPriceCents: 1500,
  },
] as const;

/** All valid add-on slugs */
export const ADDON_SLUGS = ADDON_CATALOG.map((a) => a.slug);

/** Lookup add-on definition by slug */
export function getAddonBySlug(slug: string): AddonDefinition | undefined {
  return ADDON_CATALOG.find((a) => a.slug === slug);
}

/** Get add-on label by slug */
export function getAddonLabel(slug: string): string {
  return getAddonBySlug(slug)?.label ?? slug.replace(/_/g, ' ');
}

/** Get short label for badges */
export function getAddonShortLabel(slug: string): string {
  return getAddonBySlug(slug)?.shortLabel ?? slug.replace(/_/g, ' ');
}

/** Get emoji for an add-on */
export function getAddonEmoji(slug: string): string {
  return getAddonBySlug(slug)?.emoji ?? '➕';
}

/** Get add-ons applicable to a specific service type */
export function getAddonsForService(serviceType: string): AddonDefinition[] {
  return ADDON_CATALOG.filter((a) => a.applicableServices.includes(serviceType as ServiceType));
}

/** Get add-ons grouped by category */
export function getAddonsByCategory(): { category: string; label: string; addons: AddonDefinition[] }[] {
  const categoryLabels: Record<string, string> = {
    care: 'Care',
    grooming: 'Grooming',
    convenience: 'Convenience',
    training: 'Training',
  };
  const groups: { category: string; label: string; addons: AddonDefinition[] }[] = [];
  for (const [cat, label] of Object.entries(categoryLabels)) {
    const addons = ADDON_CATALOG.filter((a) => a.category === cat);
    if (addons.length > 0) groups.push({ category: cat, label, addons });
  }
  return groups;
}

/** Filter catalog by sitter's accepted species */
export function getAddonsForSpecies(acceptedSpecies?: string[]): AddonDefinition[] {
  if (!acceptedSpecies || acceptedSpecies.length === 0) return [...ADDON_CATALOG];
  return ADDON_CATALOG.filter((a) => {
    if (a.species === 'all') return true;
    return a.species.some((s) => acceptedSpecies.includes(s));
  });
}
