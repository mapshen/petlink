import type { Router } from 'express';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';

const VALID_SPECIES = ['dog', 'cat', 'bird', 'reptile', 'small_animal'];

export default function speciesProfileRoutes(router: Router): void {
  // Get all species profiles for the current sitter
  router.get('/species-profiles/me', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const profiles = await sql`
      SELECT * FROM sitter_species_profiles
      WHERE sitter_id = ${req.userId}
      ORDER BY species
    `;
    res.json({ profiles });
  });

  // Get species profiles for a specific sitter (public)
  router.get('/species-profiles/:sitterId', async (req, res) => {
    const sitterId = Number(req.params.sitterId);
    if (!Number.isInteger(sitterId) || sitterId <= 0) {
      res.status(400).json({ error: 'Invalid sitter ID' });
      return;
    }
    const profiles = await sql`
      SELECT * FROM sitter_species_profiles
      WHERE sitter_id = ${sitterId}
      ORDER BY species
    `;
    res.json({ profiles });
  });

  // Upsert a species profile
  router.put('/species-profiles/:species', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const species = req.params.species;
    if (!VALID_SPECIES.includes(species)) {
      res.status(400).json({ error: `Invalid species. Must be one of: ${VALID_SPECIES.join(', ')}` });
      return;
    }

    const [currentUser] = await sql`SELECT roles, approval_status FROM users WHERE id = ${req.userId}`;
    if (!currentUser.roles.includes('sitter')) {
      res.status(403).json({ error: 'Only sitters can manage species profiles' });
      return;
    }

    const {
      years_experience, accepted_pet_sizes, skills, max_pets, max_pets_per_walk,
      has_yard, has_fenced_yard, dogs_on_furniture, dogs_on_bed, potty_break_frequency,
      accepts_puppies, accepts_unspayed, accepts_unneutered, accepts_females_in_heat,
      owns_same_species, own_pets_description,
    } = req.body;

    const [profile] = await sql`
      INSERT INTO sitter_species_profiles (
        sitter_id, species, years_experience, accepted_pet_sizes, skills,
        max_pets, max_pets_per_walk, has_yard, has_fenced_yard,
        dogs_on_furniture, dogs_on_bed, potty_break_frequency,
        accepts_puppies, accepts_unspayed, accepts_unneutered, accepts_females_in_heat,
        owns_same_species, own_pets_description
      ) VALUES (
        ${req.userId}, ${species},
        ${years_experience ?? null}, ${accepted_pet_sizes ?? []}, ${skills ?? []},
        ${max_pets ?? 1}, ${max_pets_per_walk ?? null},
        ${has_yard ?? false}, ${has_fenced_yard ?? false},
        ${dogs_on_furniture ?? false}, ${dogs_on_bed ?? false},
        ${potty_break_frequency ?? null},
        ${accepts_puppies ?? true}, ${accepts_unspayed ?? true},
        ${accepts_unneutered ?? true}, ${accepts_females_in_heat ?? true},
        ${owns_same_species ?? false}, ${own_pets_description ?? null}
      )
      ON CONFLICT (sitter_id, species) DO UPDATE SET
        years_experience = EXCLUDED.years_experience,
        accepted_pet_sizes = EXCLUDED.accepted_pet_sizes,
        skills = EXCLUDED.skills,
        max_pets = EXCLUDED.max_pets,
        max_pets_per_walk = EXCLUDED.max_pets_per_walk,
        has_yard = EXCLUDED.has_yard,
        has_fenced_yard = EXCLUDED.has_fenced_yard,
        dogs_on_furniture = EXCLUDED.dogs_on_furniture,
        dogs_on_bed = EXCLUDED.dogs_on_bed,
        potty_break_frequency = EXCLUDED.potty_break_frequency,
        accepts_puppies = EXCLUDED.accepts_puppies,
        accepts_unspayed = EXCLUDED.accepts_unspayed,
        accepts_unneutered = EXCLUDED.accepts_unneutered,
        accepts_females_in_heat = EXCLUDED.accepts_females_in_heat,
        owns_same_species = EXCLUDED.owns_same_species,
        own_pets_description = EXCLUDED.own_pets_description
      RETURNING *
    `;

    // Also add species to user's accepted_species if not already there
    await sql`
      UPDATE users SET accepted_species = array_append(accepted_species, ${species})
      WHERE id = ${req.userId} AND NOT (${species} = ANY(accepted_species))
    `.catch(() => {});

    res.json({ profile });
  });

  // Delete a species profile
  router.delete('/species-profiles/:species', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const species = req.params.species;
    if (!VALID_SPECIES.includes(species)) {
      res.status(400).json({ error: `Invalid species` });
      return;
    }

    const [existing] = await sql`
      SELECT id FROM sitter_species_profiles
      WHERE sitter_id = ${req.userId} AND species = ${species}
    `;
    if (!existing) {
      res.status(404).json({ error: 'Species profile not found' });
      return;
    }

    // Delete the profile and associated services
    await sql`DELETE FROM sitter_species_profiles WHERE sitter_id = ${req.userId} AND species = ${species}`;
    await sql`DELETE FROM services WHERE sitter_id = ${req.userId} AND species = ${species}`;

    // Remove species from user's accepted_species
    await sql`
      UPDATE users SET accepted_species = array_remove(accepted_species, ${species})
      WHERE id = ${req.userId}
    `.catch(() => {});

    res.json({ success: true });
  });
}
