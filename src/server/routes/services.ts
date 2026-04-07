import type { Router } from 'express';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { validate, serviceSchema } from '../validation.ts';
import logger, { sanitizeError } from '../logger.ts';

export default function serviceRoutes(router: Router): void {
  router.get('/services/me', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const services = await sql`SELECT * FROM services WHERE sitter_id = ${req.userId}`;
      res.json({ services });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to load services');
      res.status(500).json({ error: 'Failed to load services' });
    }
  });

  router.post('/services', authMiddleware, validate(serviceSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const [currentUser] = await sql`SELECT roles, approval_status FROM users WHERE id = ${req.userId}`;
      if (!currentUser.roles.includes('sitter')) {
        res.status(403).json({ error: 'Only sitters can manage services' });
        return;
      }
      if (currentUser.approval_status !== 'approved' && currentUser.approval_status !== 'onboarding') {
        res.status(403).json({ error: 'Your sitter account is not active.' });
        return;
      }
      const { type, price_cents, description, additional_pet_price_cents, max_pets, service_details, species,
        holiday_rate_cents, puppy_rate_cents, pickup_dropoff_fee_cents, grooming_addon_fee_cents,
        nightly_rate_cents, half_day_rate_cents } = req.body;
      const [existing] = await sql`SELECT id FROM services WHERE sitter_id = ${req.userId} AND type = ${type} AND (species = ${species ?? null} OR (species IS NULL AND ${species ?? null} IS NULL))`;
      if (existing) {
        res.status(409).json({ error: `You already have a ${type} service${species ? ` for ${species}` : ''}. Edit it instead.` });
        return;
      }
      const [service] = await sql`
        INSERT INTO services (sitter_id, type, price_cents, description, additional_pet_price_cents, max_pets, service_details, species,
          holiday_rate_cents, puppy_rate_cents, pickup_dropoff_fee_cents, grooming_addon_fee_cents,
          nightly_rate_cents, half_day_rate_cents)
        VALUES (${req.userId}, ${type}, ${price_cents}, ${description || null}, ${additional_pet_price_cents || 0}, ${max_pets || 1},
          ${service_details ? sql.json(service_details) : null}, ${species ?? null},
          ${holiday_rate_cents ?? null}, ${puppy_rate_cents ?? null}, ${pickup_dropoff_fee_cents ?? null}, ${grooming_addon_fee_cents ?? null},
          ${nightly_rate_cents ?? null}, ${half_day_rate_cents ?? null})
        RETURNING *
      `;
      res.status(201).json({ service });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to create service');
      res.status(500).json({ error: 'Failed to create service' });
    }
  });

  router.put('/services/:id', authMiddleware, validate(serviceSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const [currentUser] = await sql`SELECT roles, approval_status FROM users WHERE id = ${req.userId}`;
      if (!currentUser.roles.includes('sitter')) {
        res.status(403).json({ error: 'Only sitters can manage services' });
        return;
      }
      if (currentUser.approval_status !== 'approved' && currentUser.approval_status !== 'onboarding') {
        res.status(403).json({ error: 'Your sitter account is not active.' });
        return;
      }
      const [service] = await sql`SELECT * FROM services WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
      if (!service) {
        res.status(404).json({ error: 'Service not found' });
        return;
      }
      const { type, price_cents, description, additional_pet_price_cents, max_pets, service_details, species,
        holiday_rate_cents, puppy_rate_cents, pickup_dropoff_fee_cents, grooming_addon_fee_cents,
        nightly_rate_cents, half_day_rate_cents } = req.body;
      // Prevent type/species change from creating duplicates
      if (type !== service.type || (species ?? null) !== (service.species ?? null)) {
        const [dup] = await sql`SELECT id FROM services WHERE sitter_id = ${req.userId} AND type = ${type} AND (species = ${species ?? null} OR (species IS NULL AND ${species ?? null} IS NULL)) AND id != ${req.params.id}`;
        if (dup) {
          res.status(409).json({ error: `You already have a ${type} service${species ? ` for ${species}` : ''}` });
          return;
        }
      }
      const [updated] = await sql`
        UPDATE services SET type = ${type}, price_cents = ${price_cents}, description = ${description || null}, additional_pet_price_cents = ${additional_pet_price_cents || 0},
        max_pets = ${max_pets || 1}, service_details = ${service_details ? sql.json(service_details) : null}, species = ${species ?? null},
        holiday_rate_cents = ${holiday_rate_cents ?? null}, puppy_rate_cents = ${puppy_rate_cents ?? null},
        pickup_dropoff_fee_cents = ${pickup_dropoff_fee_cents ?? null}, grooming_addon_fee_cents = ${grooming_addon_fee_cents ?? null},
        nightly_rate_cents = ${nightly_rate_cents ?? null}, half_day_rate_cents = ${half_day_rate_cents ?? null}
        WHERE id = ${req.params.id} AND sitter_id = ${req.userId}
        RETURNING *
      `;
      res.json({ service: updated });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to update service');
      res.status(500).json({ error: 'Failed to update service' });
    }
  });

  router.delete('/services/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [currentUser] = await sql`SELECT roles, approval_status FROM users WHERE id = ${req.userId}`;
      if (!currentUser.roles.includes('sitter')) {
        res.status(403).json({ error: 'Only sitters can manage services' });
        return;
      }
      if (currentUser.approval_status !== 'approved' && currentUser.approval_status !== 'onboarding') {
        res.status(403).json({ error: 'Your sitter account is not active.' });
        return;
      }
      const [service] = await sql`SELECT * FROM services WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
      if (!service) {
        res.status(404).json({ error: 'Service not found' });
        return;
      }
      await sql`DELETE FROM services WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to delete service');
      res.status(500).json({ error: 'Failed to delete service' });
    }
  });
}
