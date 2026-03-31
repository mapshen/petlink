/**
 * Species-service mapping and contextual labels.
 * Shared between server and client.
 */

export type ServiceType = 'walking' | 'sitting' | 'drop-in' | 'grooming' | 'meet_greet' | 'daycare';
export type PetSpecies = 'dog' | 'cat' | 'bird' | 'reptile' | 'small_animal';

/** Which service types are available for each species */
export const SPECIES_SERVICES: Record<PetSpecies, readonly ServiceType[]> = {
  dog: ['walking', 'daycare', 'sitting', 'drop-in', 'grooming', 'meet_greet'],
  cat: ['sitting', 'drop-in', 'grooming', 'meet_greet'],
  bird: ['sitting', 'drop-in', 'meet_greet'],
  reptile: ['sitting', 'drop-in', 'meet_greet'],
  small_animal: ['sitting', 'drop-in', 'grooming', 'meet_greet'],
};

/** All valid service types */
export const ALL_SERVICE_TYPES: readonly ServiceType[] = ['walking', 'daycare', 'sitting', 'drop-in', 'grooming', 'meet_greet'];

/** Species-specific labels for service types */
const SPECIES_LABELS: Partial<Record<PetSpecies, Partial<Record<ServiceType, string>>>> = {
  dog: { walking: 'Dog Walking', sitting: 'Dog Sitting', grooming: 'Dog Grooming', daycare: 'Dog Daycare' },
  cat: { sitting: 'Cat Sitting', grooming: 'Cat Grooming' },
};

/** Generic (multi-species or no-species) labels */
const GENERIC_LABELS: Record<ServiceType, string> = {
  walking: 'Pet Walking',
  daycare: 'Daycare',
  sitting: 'House Sitting',
  'drop-in': 'Drop-in Visit',
  grooming: 'Grooming',
  meet_greet: 'Meet & Greet',
};

/** Plural labels for search results */
const GENERIC_LABELS_PLURAL: Record<ServiceType, string> = {
  walking: 'Pet Walkers',
  daycare: 'Daycare Providers',
  sitting: 'House Sitters',
  'drop-in': 'Drop-in Visits',
  grooming: 'Groomers',
  meet_greet: 'Meet & Greet',
};

/**
 * Get a species-contextual label for a service type.
 * If species has exactly one entry, returns species-specific label.
 * Otherwise returns generic label.
 */
export function getServiceLabel(type: string, species?: string[]): string {
  const speciesKey = type as ServiceType;
  if (species && species.length === 1) {
    const sp = species[0] as PetSpecies;
    const speciesLabel = SPECIES_LABELS[sp]?.[speciesKey];
    if (speciesLabel) return speciesLabel;
  }
  return GENERIC_LABELS[speciesKey] || type.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Get plural label for search results */
export function getServiceLabelPlural(type: string): string {
  return GENERIC_LABELS_PLURAL[type as ServiceType] || getServiceLabel(type);
}

/** Get available service types for a set of accepted species */
export function getAvailableServices(acceptedSpecies?: string[]): ServiceType[] {
  if (!acceptedSpecies || acceptedSpecies.length === 0) return [...ALL_SERVICE_TYPES];

  const available = new Set<ServiceType>();
  for (const species of acceptedSpecies) {
    const services = SPECIES_SERVICES[species as PetSpecies];
    if (services) {
      for (const s of services) available.add(s);
    }
  }
  // Preserve canonical order
  return ALL_SERVICE_TYPES.filter((s) => available.has(s));
}
