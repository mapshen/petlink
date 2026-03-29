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
    const [currentUser] = await sql`SELECT role, approval_status FROM users WHERE id = ${req.userId}`;
    if (currentUser.role !== 'sitter' && currentUser.role !== 'both') {
      res.status(403).json({ error: 'Only sitters can manage services' });
      return;
    }
    if (currentUser.approval_status !== 'approved') {
      res.status(403).json({ error: 'Your sitter account is pending approval. You cannot manage services yet.' });
      return;
    }
    const { type, price, description, additional_pet_price, max_pets, service_details } = req.body;
    const [existing] = await sql`SELECT id FROM services WHERE sitter_id = ${req.userId} AND type = ${type}`;
    if (existing) {
      res.status(409).json({ error: `You already have a ${type} service. Edit it instead.` });
      return;
    }
    const [service] = await sql`
      INSERT INTO services (sitter_id, type, price, description, additional_pet_price, max_pets, service_details)
      VALUES (${req.userId}, ${type}, ${price}, ${description || null}, ${additional_pet_price || 0}, ${max_pets || 1}, ${service_details ? sql.json(service_details) : null})
      RETURNING *
    `;
    res.status(201).json({ service });
  });

  router.put('/services/:id', authMiddleware, validate(serviceSchema), async (req: AuthenticatedRequest, res) => {
    const [currentUser] = await sql`SELECT role, approval_status FROM users WHERE id = ${req.userId}`;
    if (currentUser.role !== 'sitter' && currentUser.role !== 'both') {
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
    const { type, price, description, additional_pet_price, max_pets, service_details } = req.body;
    const [updated] = await sql`
      UPDATE services SET type = ${type}, price = ${price}, description = ${description || null}, additional_pet_price = ${additional_pet_price || 0},
      max_pets = ${max_pets || 1}, service_details = ${service_details ? sql.json(service_details) : null}
      WHERE id = ${req.params.id} AND sitter_id = ${req.userId}
      RETURNING *
    `;
    res.json({ service: updated });
  });

  router.delete('/services/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [currentUser] = await sql`SELECT role, approval_status FROM users WHERE id = ${req.userId}`;
    if (currentUser.role !== 'sitter' && currentUser.role !== 'both') {
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
