import type { Router } from 'express';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { validate, serviceSchema } from '../validation.ts';

export default function serviceRoutes(router: Router): void {
  router.get('/services/me', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const services = await sql`SELECT * FROM services WHERE sitter_id = ${req.userId}`;
    res.json({ services });
  });

  router.post('/services', authMiddleware, validate(serviceSchema), async (req: AuthenticatedRequest, res) => {
    const [currentUser] = await sql`SELECT roles, approval_status FROM users WHERE id = ${req.userId}`;
    if (!currentUser.roles.includes('sitter')) {
      res.status(403).json({ error: 'Only sitters can manage services' });
      return;
    }
    if (currentUser.approval_status !== 'approved') {
      res.status(403).json({ error: 'Your sitter account is pending approval. You cannot manage services yet.' });
      return;
    }
    const { type, price, description, additional_pet_price, max_pets, service_details, species,
      holiday_rate, puppy_rate, pickup_dropoff_fee, grooming_addon_fee } = req.body;
    const [existing] = await sql`SELECT id FROM services WHERE sitter_id = ${req.userId} AND type = ${type} AND (species = ${species ?? null} OR (species IS NULL AND ${species ?? null} IS NULL))`;
    if (existing) {
      res.status(409).json({ error: `You already have a ${type} service${species ? ` for ${species}` : ''}. Edit it instead.` });
      return;
    }
    const [service] = await sql`
      INSERT INTO services (sitter_id, type, price, description, additional_pet_price, max_pets, service_details, species,
        holiday_rate, puppy_rate, pickup_dropoff_fee, grooming_addon_fee)
      VALUES (${req.userId}, ${type}, ${price}, ${description || null}, ${additional_pet_price || 0}, ${max_pets || 1},
        ${service_details ? sql.json(service_details) : null}, ${species ?? null},
        ${holiday_rate ?? null}, ${puppy_rate ?? null}, ${pickup_dropoff_fee ?? null}, ${grooming_addon_fee ?? null})
      RETURNING *
    `;
    res.status(201).json({ service });
  });

  router.put('/services/:id', authMiddleware, validate(serviceSchema), async (req: AuthenticatedRequest, res) => {
    const [currentUser] = await sql`SELECT roles, approval_status FROM users WHERE id = ${req.userId}`;
    if (!currentUser.roles.includes('sitter')) {
      res.status(403).json({ error: 'Only sitters can manage services' });
      return;
    }
    if (currentUser.approval_status !== 'approved') {
      res.status(403).json({ error: 'Your sitter account is pending approval. You cannot manage services yet.' });
      return;
    }
    const [service] = await sql`SELECT * FROM services WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
    if (!service) {
      res.status(404).json({ error: 'Service not found' });
      return;
    }
    const { type, price, description, additional_pet_price, max_pets, service_details, species,
      holiday_rate, puppy_rate, pickup_dropoff_fee, grooming_addon_fee } = req.body;
    // Prevent type/species change from creating duplicates
    if (type !== service.type || (species ?? null) !== (service.species ?? null)) {
      const [dup] = await sql`SELECT id FROM services WHERE sitter_id = ${req.userId} AND type = ${type} AND (species = ${species ?? null} OR (species IS NULL AND ${species ?? null} IS NULL)) AND id != ${req.params.id}`;
      if (dup) {
        res.status(409).json({ error: `You already have a ${type} service${species ? ` for ${species}` : ''}` });
        return;
      }
    }
    const [updated] = await sql`
      UPDATE services SET type = ${type}, price = ${price}, description = ${description || null}, additional_pet_price = ${additional_pet_price || 0},
      max_pets = ${max_pets || 1}, service_details = ${service_details ? sql.json(service_details) : null}, species = ${species ?? null},
      holiday_rate = ${holiday_rate ?? null}, puppy_rate = ${puppy_rate ?? null},
      pickup_dropoff_fee = ${pickup_dropoff_fee ?? null}, grooming_addon_fee = ${grooming_addon_fee ?? null}
      WHERE id = ${req.params.id} AND sitter_id = ${req.userId}
      RETURNING *
    `;
    res.json({ service: updated });
  });

  router.delete('/services/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [currentUser] = await sql`SELECT roles, approval_status FROM users WHERE id = ${req.userId}`;
    if (!currentUser.roles.includes('sitter')) {
      res.status(403).json({ error: 'Only sitters can manage services' });
      return;
    }
    if (currentUser.approval_status !== 'approved') {
      res.status(403).json({ error: 'Your sitter account is pending approval. You cannot manage services yet.' });
      return;
    }
    const [service] = await sql`SELECT * FROM services WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
    if (!service) {
      res.status(404).json({ error: 'Service not found' });
      return;
    }
    await sql`DELETE FROM services WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
    res.json({ success: true });
  });
}
