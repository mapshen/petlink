import type { Sql } from 'postgres';
import logger from './logger';

const DOG_ONLY_SERVICES = ['walking', 'daycare'];

export interface SitterRow {
  id: number;
  accepted_species: string[];
  years_experience: number | null;
  accepted_pet_sizes: string[];
  skills: string[];
  max_pets_at_once: number | null;
  max_pets_per_walk: number | null;
  has_yard: boolean;
  has_fenced_yard: boolean;
  has_own_pets: boolean;
  own_pets_description: string | null;
}

export interface SpeciesProfileRow {
  sitter_id: number;
  species: string;
  years_experience: number | null;
  accepted_pet_sizes: string[];
  skills: string[];
  max_pets: number;
  max_pets_per_walk: number | null;
  has_yard: boolean;
  has_fenced_yard: boolean;
  owns_same_species: boolean;
  own_pets_description: string | null;
}

export function buildSpeciesProfiles(sitter: SitterRow): SpeciesProfileRow[] {
  return sitter.accepted_species.map((species) => ({
    sitter_id: sitter.id,
    species,
    years_experience: sitter.years_experience,
    accepted_pet_sizes: sitter.accepted_pet_sizes || [],
    skills: sitter.skills || [],
    max_pets: sitter.max_pets_at_once ?? 3,
    max_pets_per_walk: species === 'dog' ? (sitter.max_pets_per_walk ?? 2) : null,
    has_yard: species === 'dog' ? (sitter.has_yard ?? false) : false,
    has_fenced_yard: species === 'dog' ? (sitter.has_fenced_yard ?? false) : false,
    owns_same_species: sitter.has_own_pets ?? false,
    own_pets_description: sitter.has_own_pets ? (sitter.own_pets_description ?? null) : null,
  }));
}

export function getServiceSpecies(serviceType: string, acceptedSpecies: string[]): string {
  if (DOG_ONLY_SERVICES.includes(serviceType)) return 'dog';
  return acceptedSpecies[0] || 'dog';
}

export async function backfillSpeciesProfiles(sql: Sql): Promise<{ profilesCreated: number; servicesUpdated: number }> {
  // Find sitters who have accepted_species but no species profiles yet
  const sitters = await sql`
    SELECT u.id, u.accepted_species, u.years_experience, u.accepted_pet_sizes,
           u.skills, u.max_pets_at_once, u.max_pets_per_walk, u.has_yard,
           u.has_fenced_yard, u.has_own_pets, u.own_pets_description
    FROM users u
    WHERE 'sitter' = ANY(u.roles)
      AND array_length(u.accepted_species, 1) > 0
      AND NOT EXISTS (
        SELECT 1 FROM sitter_species_profiles sp WHERE sp.sitter_id = u.id
      )
  `;

  let profilesCreated = 0;
  for (const sitter of sitters) {
    const profiles = buildSpeciesProfiles(sitter as unknown as SitterRow);
    for (const p of profiles) {
      await sql`
        INSERT INTO sitter_species_profiles (
          sitter_id, species, years_experience, accepted_pet_sizes, skills,
          max_pets, max_pets_per_walk, has_yard, has_fenced_yard,
          owns_same_species, own_pets_description
        ) VALUES (
          ${p.sitter_id}, ${p.species}, ${p.years_experience}, ${p.accepted_pet_sizes},
          ${p.skills}, ${p.max_pets}, ${p.max_pets_per_walk}, ${p.has_yard},
          ${p.has_fenced_yard}, ${p.owns_same_species}, ${p.own_pets_description}
        ) ON CONFLICT (sitter_id, species) DO NOTHING
      `;
      profilesCreated++;
    }
  }

  // Backfill species on services that don't have one
  const updated = await sql`
    UPDATE services s
    SET species = CASE
      WHEN s.type IN ('walking', 'daycare') THEN 'dog'
      ELSE COALESCE(
        (SELECT u.accepted_species[1] FROM users u WHERE u.id = s.sitter_id),
        'dog'
      )
    END
    WHERE s.species IS NULL
  `;

  const servicesUpdated = updated.count;

  if (profilesCreated > 0 || servicesUpdated > 0) {
    logger.info({ profilesCreated, servicesUpdated }, 'Backfilled species profiles and service species');
  }

  return { profilesCreated, servicesUpdated };
}
