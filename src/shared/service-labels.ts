/**
 * Species-service mapping and contextual labels.
 * Shared between server and client.
 */

export type ServiceType = 'walking' | 'sitting' | 'drop-in' | 'grooming' | 'meet_greet' | 'daycare';
export type PetSpecies = 'dog' | 'cat' | 'bird' | 'reptile' | 'small_animal';

/** Which service types are available for each species */
export const SPECIES_SERVICES: Record<PetSpecies, readonly ServiceType[]> = {
  dog: ['meet_greet', 'walking', 'daycare', 'sitting', 'drop-in', 'grooming'],
  cat: ['meet_greet', 'sitting', 'drop-in', 'grooming'],
  bird: ['meet_greet', 'sitting', 'drop-in'],
  reptile: ['meet_greet', 'sitting', 'drop-in'],
  small_animal: ['meet_greet', 'sitting', 'drop-in', 'grooming'],
};

/** All valid service types */
export const ALL_SERVICE_TYPES: readonly ServiceType[] = ['meet_greet', 'walking', 'daycare', 'sitting', 'drop-in', 'grooming'];

/** Service labels — species-neutral, clean names */
const GENERIC_LABELS: Record<ServiceType, string> = {
  meet_greet: 'Meet & Greet',
  walking: 'Walking',
  daycare: 'Daycare',
  sitting: 'House Sitting',
  'drop-in': 'Drop-in Visit',
  grooming: 'Grooming',
};

/** Plural labels for search results */
const GENERIC_LABELS_PLURAL: Record<ServiceType, string> = {
  meet_greet: 'Meet & Greet',
  walking: 'Walkers',
  daycare: 'Daycare Providers',
  sitting: 'House Sitters',
  'drop-in': 'Drop-in Visits',
  grooming: 'Groomers',
};

/**
 * Get a species-contextual label for a service type.
 * If species has exactly one entry, returns species-specific label.
 * Otherwise returns generic label.
 */
export function getServiceLabel(type: string, _species?: string[]): string {
  return GENERIC_LABELS[type as ServiceType] || type.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
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

/** Skills/certifications with species relevance */
export interface SkillOption {
  readonly value: string;
  readonly label: string;
  readonly species: readonly PetSpecies[] | 'all';
}

export const SKILL_OPTIONS: readonly SkillOption[] = [
  // Universal
  { value: 'pet_first_aid', label: 'Pet First Aid', species: 'all' },
  { value: 'medication_admin', label: 'Medication Administration', species: 'all' },
  { value: 'senior_pet_care', label: 'Senior Pet Care', species: 'all' },
  { value: 'behavioral_issues', label: 'Behavioral Issues', species: 'all' },
  { value: 'grooming_basics', label: 'Grooming Basics', species: 'all' },
  // Dog
  { value: 'dog_training', label: 'Dog Training', species: ['dog'] },
  { value: 'puppy_care', label: 'Puppy Care', species: ['dog'] },
  { value: 'leash_reactive', label: 'Leash-Reactive Dogs', species: ['dog'] },
  { value: 'large_breed_exp', label: 'Large Breed Experience', species: ['dog'] },
  // Cat
  { value: 'cat_behavior', label: 'Cat Behavior', species: ['cat'] },
  { value: 'kitten_care', label: 'Kitten Care', species: ['cat'] },
  { value: 'feral_cat_exp', label: 'Feral/Shy Cat Experience', species: ['cat'] },
  // Exotic
  { value: 'avian_care', label: 'Avian Care', species: ['bird'] },
  { value: 'reptile_husbandry', label: 'Reptile Husbandry', species: ['reptile'] },
  { value: 'small_animal_care', label: 'Small Animal Care', species: ['small_animal'] },
];

/** Get skills relevant to the sitter's accepted species, grouped by category */
export function getAvailableSkills(acceptedSpecies?: string[]): SkillOption[] {
  if (!acceptedSpecies || acceptedSpecies.length === 0) return [...SKILL_OPTIONS];
  return SKILL_OPTIONS.filter((skill) => {
    if (skill.species === 'all') return true;
    return skill.species.some((s) => acceptedSpecies.includes(s));
  });
}

/** Group skills by species category for display */
export function getSkillGroups(acceptedSpecies?: string[]): { label: string; skills: SkillOption[] }[] {
  const available = getAvailableSkills(acceptedSpecies);
  const groups: { label: string; skills: SkillOption[] }[] = [];

  const universal = available.filter((s) => s.species === 'all');
  if (universal.length > 0) groups.push({ label: 'Universal', skills: universal });

  const speciesNames: Record<string, string> = { dog: 'Dog', cat: 'Cat', bird: 'Bird', reptile: 'Reptile', small_animal: 'Small Animal' };
  for (const sp of acceptedSpecies || []) {
    const speciesSkills = available.filter((s) => s.species !== 'all' && (s.species as string[]).includes(sp));
    if (speciesSkills.length > 0) groups.push({ label: speciesNames[sp] || sp, skills: speciesSkills });
  }

  return groups;
}

/** Whether pet sizes are relevant for the selected species */
export function areSizesRelevant(acceptedSpecies?: string[]): boolean {
  if (!acceptedSpecies || acceptedSpecies.length === 0) return true;
  return acceptedSpecies.some((s) => ['dog'].includes(s));
}

/** Whether walking capacity is relevant (only for dogs) */
export function isWalkCapacityRelevant(acceptedSpecies?: string[]): boolean {
  if (!acceptedSpecies || acceptedSpecies.length === 0) return true;
  return acceptedSpecies.includes('dog');
}
