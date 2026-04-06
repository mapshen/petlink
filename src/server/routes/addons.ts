import type { Router } from 'express';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { validate, sitterAddonSchema, updateSitterAddonSchema } from '../validation.ts';

export default function addonRoutes(router: Router): void {
  // List sitter's own add-ons
  router.get('/addons/me', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const addons = await sql`SELECT * FROM sitter_addons WHERE sitter_id = ${req.userId} ORDER BY created_at`;
    res.json({ addons });
  });

  // Public: list a sitter's add-ons (for booking UI)
  router.get('/addons/sitter/:sitterId', async (req, res) => {
    const sitterId = Number(req.params.sitterId);
    if (!Number.isInteger(sitterId) || sitterId <= 0) {
      res.status(400).json({ error: 'Invalid sitter ID' });
      return;
    }
    const addons = await sql`SELECT id, addon_slug, price_cents, notes FROM sitter_addons WHERE sitter_id = ${sitterId} ORDER BY created_at`;
    res.json({ addons });
  });

  // Enable an add-on
  router.post('/addons', authMiddleware, validate(sitterAddonSchema), async (req: AuthenticatedRequest, res) => {
    const [currentUser] = await sql`SELECT roles, approval_status FROM users WHERE id = ${req.userId}`;
    if (!currentUser.roles.includes('sitter')) {
      res.status(403).json({ error: 'Only sitters can manage add-ons' });
      return;
    }
    if (currentUser.approval_status !== 'approved' && currentUser.approval_status !== 'onboarding') {
      res.status(403).json({ error: 'Your sitter account is not active.' });
      return;
    }

    const { addon_slug, price_cents, notes } = req.body;

    const [existing] = await sql`SELECT id FROM sitter_addons WHERE sitter_id = ${req.userId} AND addon_slug = ${addon_slug}`;
    if (existing) {
      res.status(409).json({ error: 'You have already enabled this add-on. Edit it instead.' });
      return;
    }

    const [addon] = await sql`
      INSERT INTO sitter_addons (sitter_id, addon_slug, price_cents, notes)
      VALUES (${req.userId}, ${addon_slug}, ${price_cents}, ${notes ?? null})
      RETURNING *
    `;
    res.status(201).json({ addon });
  });

  // Update an add-on's price/notes
  router.put('/addons/:id', authMiddleware, validate(updateSitterAddonSchema), async (req: AuthenticatedRequest, res) => {
    const [addon] = await sql`SELECT * FROM sitter_addons WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
    if (!addon) {
      res.status(404).json({ error: 'Add-on not found' });
      return;
    }

    const { price_cents, notes } = req.body;
    const [updated] = await sql`
      UPDATE sitter_addons SET price_cents = ${price_cents}, notes = ${notes ?? null}
      WHERE id = ${req.params.id} AND sitter_id = ${req.userId}
      RETURNING *
    `;
    res.json({ addon: updated });
  });

  // Remove an add-on
  router.delete('/addons/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [addon] = await sql`SELECT * FROM sitter_addons WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
    if (!addon) {
      res.status(404).json({ error: 'Add-on not found' });
      return;
    }
    await sql`DELETE FROM sitter_addons WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
    res.json({ success: true });
  });
}
