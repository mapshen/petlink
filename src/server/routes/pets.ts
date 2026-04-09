import type { Router } from 'express';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { validate, petSchema, petVaccinationSchema, updateCareInstructionsSchema } from '../validation.ts';
import { generateUniqueSlug } from '../slugify.ts';
import logger, { sanitizeError } from '../logger.ts';

export default function petRoutes(router: Router): void {
  // --- Pets ---
  router.get('/pets', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const pets = await sql`SELECT * FROM pets WHERE owner_id = ${req.userId}`;
      res.json({ pets });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch pets');
      res.status(500).json({ error: 'Failed to fetch pets' });
    }
  });

  router.post('/pets', authMiddleware, validate(petSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const { name, species, breed, age, weight, gender, spayed_neutered, energy_level, house_trained, temperament, special_needs, microchip_number, vet_name, vet_phone, emergency_contact_name, emergency_contact_phone, medical_history, photo_url } = req.body;
      const slug = await generateUniqueSlug(name, 'pets');
      const [pet] = await sql`
        INSERT INTO pets (owner_id, name, slug, species, breed, age, weight, gender, spayed_neutered, energy_level, house_trained, temperament, special_needs, microchip_number, vet_name, vet_phone, emergency_contact_name, emergency_contact_phone, medical_history, photo_url)
        VALUES (${req.userId}, ${name}, ${slug}, ${species || 'dog'}, ${breed || null}, ${age ?? null}, ${weight ?? null}, ${gender || null}, ${spayed_neutered ?? null}, ${energy_level || null}, ${house_trained ?? null}, ${temperament || []}, ${special_needs || null}, ${microchip_number || null}, ${vet_name || null}, ${vet_phone || null}, ${emergency_contact_name || null}, ${emergency_contact_phone || null}, ${medical_history || null}, ${photo_url || null})
        RETURNING *
      `;
      res.status(201).json({ pet });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to create pet');
      res.status(500).json({ error: 'Failed to create pet' });
    }
  });

  router.put('/pets/:id', authMiddleware, validate(petSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const [pet] = await sql`SELECT * FROM pets WHERE id = ${req.params.id} AND owner_id = ${req.userId}`;
      if (!pet) {
        res.status(404).json({ error: 'Pet not found' });
        return;
      }
      const { name, species, breed, age, weight, gender, spayed_neutered, energy_level, house_trained, temperament, special_needs, microchip_number, vet_name, vet_phone, emergency_contact_name, emergency_contact_phone, medical_history, photo_url } = req.body;
      const [updated] = await sql`
        UPDATE pets SET name = ${name}, species = ${species || 'dog'}, breed = ${breed || null}, age = ${age ?? null},
        weight = ${weight ?? null}, gender = ${gender || null}, spayed_neutered = ${spayed_neutered ?? null},
        energy_level = ${energy_level || null}, house_trained = ${house_trained ?? null}, temperament = ${temperament || []},
        special_needs = ${special_needs || null}, microchip_number = ${microchip_number || null},
        vet_name = ${vet_name || null}, vet_phone = ${vet_phone || null},
        emergency_contact_name = ${emergency_contact_name || null}, emergency_contact_phone = ${emergency_contact_phone || null},
        medical_history = ${medical_history || null}, photo_url = ${photo_url || null}
        WHERE id = ${req.params.id} AND owner_id = ${req.userId}
        RETURNING *
      `;
      res.json({ pet: updated });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to update pet');
      res.status(500).json({ error: 'Failed to update pet' });
    }
  });

  router.delete('/pets/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [pet] = await sql`SELECT * FROM pets WHERE id = ${req.params.id} AND owner_id = ${req.userId}`;
      if (!pet) {
        res.status(404).json({ error: 'Pet not found' });
        return;
      }
      await sql`DELETE FROM pets WHERE id = ${req.params.id} AND owner_id = ${req.userId}`;
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to delete pet');
      res.status(500).json({ error: 'Failed to delete pet' });
    }
  });

  // --- Public Pet Profile (auth-gated) ---
  router.get('/pets/by-slug/:slug', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const slug = req.params.slug;
      if (!slug || slug.length > 100 || !/^[a-z0-9-]+$/.test(slug)) {
        res.status(400).json({ error: 'Invalid slug format' });
        return;
      }

      const [pet] = await sql`
        SELECT p.id, p.name, p.slug, p.species, p.breed, p.age, p.weight, p.gender,
               p.spayed_neutered, p.energy_level, p.house_trained, p.temperament,
               p.special_needs, p.photo_url, p.owner_id, p.care_instructions
        FROM pets p
        WHERE p.slug = ${req.params.slug}
      `;
      if (!pet) {
        res.status(404).json({ error: 'Pet not found' });
        return;
      }
      const isOwner = req.userId === pet.owner_id;
      // Check if requester has an active/completed booking with this pet
      const [[hasBooking], [currentUser]] = await Promise.all([
        sql`
          SELECT EXISTS(
            SELECT 1 FROM booking_pets bp
            JOIN bookings b ON b.id = bp.booking_id
            WHERE bp.pet_id = ${pet.id}
              AND b.sitter_id = ${req.userId}
              AND b.status IN ('confirmed', 'in_progress', 'completed')
          ) AS has_booking
        `,
        sql`SELECT roles FROM users WHERE id = ${req.userId}`,
      ]);
      const isAdmin = currentUser?.roles?.includes('admin');
      const canViewPrivate = isOwner || isAdmin || hasBooking?.has_booking;

      const [owner, vaccinations] = await Promise.all([
        sql`SELECT id, name, slug, avatar_url, created_at FROM users WHERE id = ${pet.owner_id}`.then(r => r[0]),
        canViewPrivate
          ? sql`SELECT id, vaccine_name, administered_date, expires_at FROM pet_vaccinations WHERE pet_id = ${pet.id} ORDER BY expires_at DESC NULLS LAST, created_at DESC`
          : Promise.resolve([]),
      ]);

      res.json({
        pet: {
          id: pet.id,
          name: pet.name,
          slug: pet.slug,
          species: pet.species,
          breed: pet.breed,
          age: pet.age,
          weight: pet.weight,
          gender: pet.gender,
          spayed_neutered: pet.spayed_neutered,
          energy_level: pet.energy_level,
          house_trained: pet.house_trained,
          temperament: pet.temperament,
          special_needs: pet.special_needs,
          photo_url: pet.photo_url,
          // Private fields: only for owner or booked sitters
          ...(canViewPrivate ? { care_instructions: pet.care_instructions } : {}),
        },
        owner: owner ? { id: owner.id, name: owner.name, slug: owner.slug, avatar_url: owner.avatar_url } : null,
        vaccinations,
        isOwner,
        canViewPrivate,
      });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch pet profile');
      res.status(500).json({ error: 'Failed to fetch pet profile' });
    }
  });

  // --- Pet Vaccinations ---
  router.get('/pets/:petId/vaccinations', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [pet] = await sql`SELECT id FROM pets WHERE id = ${req.params.petId} AND owner_id = ${req.userId}`;
      if (!pet) {
        res.status(404).json({ error: 'Pet not found' });
        return;
      }
      const vaccinations = await sql`SELECT * FROM pet_vaccinations WHERE pet_id = ${req.params.petId} ORDER BY expires_at DESC NULLS LAST, created_at DESC`;
      res.json({ vaccinations });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch pet vaccinations');
      res.status(500).json({ error: 'Failed to fetch pet vaccinations' });
    }
  });

  router.post('/pets/:petId/vaccinations', authMiddleware, validate(petVaccinationSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const [pet] = await sql`SELECT id FROM pets WHERE id = ${req.params.petId} AND owner_id = ${req.userId}`;
      if (!pet) {
        res.status(404).json({ error: 'Pet not found' });
        return;
      }
      const { vaccine_name, administered_date, expires_at, document_url } = req.body;
      const [vaccination] = await sql`
        INSERT INTO pet_vaccinations (pet_id, vaccine_name, administered_date, expires_at, document_url)
        VALUES (${req.params.petId}, ${vaccine_name}, ${administered_date || null}, ${expires_at || null}, ${document_url || null})
        RETURNING *
      `;
      res.status(201).json({ vaccination });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to create pet vaccination');
      res.status(500).json({ error: 'Failed to create pet vaccination' });
    }
  });

  router.delete('/pets/:petId/vaccinations/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [pet] = await sql`SELECT id FROM pets WHERE id = ${req.params.petId} AND owner_id = ${req.userId}`;
      if (!pet) {
        res.status(404).json({ error: 'Pet not found' });
        return;
      }
      const [vacc] = await sql`SELECT id FROM pet_vaccinations WHERE id = ${req.params.id} AND pet_id = ${req.params.petId}`;
      if (!vacc) {
        res.status(404).json({ error: 'Vaccination record not found' });
        return;
      }
      await sql`DELETE FROM pet_vaccinations WHERE id = ${req.params.id} AND pet_id = ${req.params.petId}`;
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to delete pet vaccination');
      res.status(500).json({ error: 'Failed to delete pet vaccination' });
    }
  });

  // --- Pet Care Instructions ---
  router.put('/pets/:id/care-instructions', authMiddleware, validate(updateCareInstructionsSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const [pet] = await sql`SELECT id FROM pets WHERE id = ${req.params.id} AND owner_id = ${req.userId}`;
      if (!pet) {
        res.status(404).json({ error: 'Pet not found' });
        return;
      }
      const { care_instructions } = req.body;
      const [updated] = await sql`
        UPDATE pets SET care_instructions = ${sql.json(care_instructions)}
        WHERE id = ${req.params.id} AND owner_id = ${req.userId}
        RETURNING id, care_instructions
      `;
      res.json({ pet: updated });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to update care instructions');
      res.status(500).json({ error: 'Failed to update care instructions' });
    }
  });

  router.get('/pets/:id/care-instructions', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [pet] = await sql`SELECT id, name, care_instructions FROM pets WHERE id = ${req.params.id} AND owner_id = ${req.userId}`;
      if (!pet) {
        res.status(404).json({ error: 'Pet not found' });
        return;
      }
      res.json({ pet_id: pet.id, pet_name: pet.name, care_instructions: pet.care_instructions || [] });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch care instructions');
      res.status(500).json({ error: 'Failed to fetch care instructions' });
    }
  });
}
