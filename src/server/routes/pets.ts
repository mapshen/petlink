import type { Router } from 'express';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { validate, petSchema, petVaccinationSchema, updateCareInstructionsSchema } from '../validation.ts';

export default function petRoutes(router: Router): void {
  // --- Pets ---
  router.get('/pets', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const pets = await sql`SELECT * FROM pets WHERE owner_id = ${req.userId}`;
    res.json({ pets });
  });

  router.post('/pets', authMiddleware, validate(petSchema), async (req: AuthenticatedRequest, res) => {
    const { name, species, breed, age, weight, gender, spayed_neutered, energy_level, house_trained, temperament, special_needs, microchip_number, vet_name, vet_phone, emergency_contact_name, emergency_contact_phone, medical_history, photo_url } = req.body;
    const [pet] = await sql`
      INSERT INTO pets (owner_id, name, species, breed, age, weight, gender, spayed_neutered, energy_level, house_trained, temperament, special_needs, microchip_number, vet_name, vet_phone, emergency_contact_name, emergency_contact_phone, medical_history, photo_url)
      VALUES (${req.userId}, ${name}, ${species || 'dog'}, ${breed || null}, ${age ?? null}, ${weight ?? null}, ${gender || null}, ${spayed_neutered ?? null}, ${energy_level || null}, ${house_trained ?? null}, ${temperament || []}, ${special_needs || null}, ${microchip_number || null}, ${vet_name || null}, ${vet_phone || null}, ${emergency_contact_name || null}, ${emergency_contact_phone || null}, ${medical_history || null}, ${photo_url || null})
      RETURNING *
    `;
    res.status(201).json({ pet });
  });

  router.put('/pets/:id', authMiddleware, validate(petSchema), async (req: AuthenticatedRequest, res) => {
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
  });

  router.delete('/pets/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [pet] = await sql`SELECT * FROM pets WHERE id = ${req.params.id} AND owner_id = ${req.userId}`;
    if (!pet) {
      res.status(404).json({ error: 'Pet not found' });
      return;
    }
    await sql`DELETE FROM pets WHERE id = ${req.params.id} AND owner_id = ${req.userId}`;
    res.json({ success: true });
  });

  // --- Pet Vaccinations ---
  router.get('/pets/:petId/vaccinations', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [pet] = await sql`SELECT id FROM pets WHERE id = ${req.params.petId} AND owner_id = ${req.userId}`;
    if (!pet) {
      res.status(404).json({ error: 'Pet not found' });
      return;
    }
    const vaccinations = await sql`SELECT * FROM pet_vaccinations WHERE pet_id = ${req.params.petId} ORDER BY expires_at DESC NULLS LAST, created_at DESC`;
    res.json({ vaccinations });
  });

  router.post('/pets/:petId/vaccinations', authMiddleware, validate(petVaccinationSchema), async (req: AuthenticatedRequest, res) => {
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
  });

  router.delete('/pets/:petId/vaccinations/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
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
  });

  // --- Pet Care Instructions ---
  router.put('/pets/:id/care-instructions', authMiddleware, validate(updateCareInstructionsSchema), async (req: AuthenticatedRequest, res) => {
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
  });

  router.get('/pets/:id/care-instructions', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [pet] = await sql`SELECT id, name, care_instructions FROM pets WHERE id = ${req.params.id} AND owner_id = ${req.userId}`;
    if (!pet) {
      res.status(404).json({ error: 'Pet not found' });
      return;
    }
    res.json({ pet_id: pet.id, pet_name: pet.name, care_instructions: pet.care_instructions || [] });
  });
}
