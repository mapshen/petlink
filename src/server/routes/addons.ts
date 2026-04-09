import type { Router } from 'express';
import type { RateLimitRequestHandler } from 'express-rate-limit';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { validate, sitterAddonSchema, updateSitterAddonSchema } from '../validation.ts';
import { botBlockMiddleware, requireUserAgent } from '../bot-detection.ts';
import { getAddonBySlug } from '../../shared/addon-catalog.ts';
import logger, { sanitizeError } from '../logger.ts';

export default function addonRoutes(router: Router, publicLimiter: RateLimitRequestHandler): void {
  // List sitter's own add-ons
  router.get('/addons/me', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const addons = await sql`SELECT * FROM sitter_addons WHERE sitter_id = ${req.userId} ORDER BY created_at`;
      res.json({ addons });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch add-ons');
      res.status(500).json({ error: 'Failed to fetch add-ons' });
    }
  });

  // Public: list a sitter's add-ons (for booking UI)
  router.get('/addons/sitter/:sitterId', requireUserAgent, botBlockMiddleware, publicLimiter, async (req, res) => {
    try {
      const sitterId = Number(req.params.sitterId);
      if (!Number.isInteger(sitterId) || sitterId <= 0) {
        res.status(400).json({ error: 'Invalid sitter ID' });
        return;
      }
      const species = req.query.species as string | undefined;
      const addons = species
        ? await sql`SELECT id, addon_slug, price_cents, notes, species FROM sitter_addons WHERE sitter_id = ${sitterId} AND (species IS NULL OR species = ${species}) ORDER BY created_at`
        : await sql`SELECT id, addon_slug, price_cents, notes, species FROM sitter_addons WHERE sitter_id = ${sitterId} ORDER BY created_at`;
      res.json({ addons });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch sitter add-ons');
      res.status(500).json({ error: 'Failed to fetch sitter add-ons' });
    }
  });

  // Enable an add-on
  router.post('/addons', authMiddleware, validate(sitterAddonSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const [currentUser] = await sql`SELECT roles, approval_status FROM users WHERE id = ${req.userId}`;
      if (!currentUser.roles.includes('sitter')) {
        res.status(403).json({ error: 'Only sitters can manage add-ons' });
        return;
      }
      if (currentUser.approval_status !== 'approved' && currentUser.approval_status !== 'onboarding') {
        res.status(403).json({ error: 'Your sitter account is not active.' });
        return;
      }

      const { addon_slug, price_cents, notes, species } = req.body;

      // Enforce canOfferFree business rule
      const def = getAddonBySlug(addon_slug);
      if (def && !def.canOfferFree && price_cents === 0) {
        res.status(400).json({ error: 'This add-on requires a price above $0' });
        return;
      }

      const speciesVal = species ?? null;
      // Check for existing addon with same (sitter_id, addon_slug, species) combo
      const [existing] = await sql`
        SELECT id FROM sitter_addons
        WHERE sitter_id = ${req.userId} AND addon_slug = ${addon_slug}
        AND COALESCE(species, '') = COALESCE(${speciesVal}, '')
      `;
      if (existing) {
        res.status(409).json({ error: 'You have already enabled this add-on. Edit it instead.' });
        return;
      }
      const [addon] = await sql`
        INSERT INTO sitter_addons (sitter_id, addon_slug, price_cents, notes, species)
        VALUES (${req.userId}, ${addon_slug}, ${price_cents}, ${notes ?? null}, ${speciesVal})
        RETURNING *
      `;
      res.status(201).json({ addon });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to create add-on');
      res.status(500).json({ error: 'Failed to create add-on' });
    }
  });

  // Update an add-on's price/notes
  router.put('/addons/:id', authMiddleware, validate(updateSitterAddonSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const [addon] = await sql`SELECT * FROM sitter_addons WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
      if (!addon) {
        res.status(404).json({ error: 'Add-on not found' });
        return;
      }

      const { price_cents, notes, species } = req.body;

      // Enforce canOfferFree business rule
      const def = getAddonBySlug(addon.addon_slug);
      if (def && !def.canOfferFree && price_cents === 0) {
        res.status(400).json({ error: 'This add-on requires a price above $0' });
        return;
      }

      const [updated] = species !== undefined
        ? await sql`
          UPDATE sitter_addons SET price_cents = ${price_cents}, notes = ${notes ?? null}, species = ${species ?? null}
          WHERE id = ${req.params.id} AND sitter_id = ${req.userId}
          RETURNING *
        `
        : await sql`
          UPDATE sitter_addons SET price_cents = ${price_cents}, notes = ${notes ?? null}
          WHERE id = ${req.params.id} AND sitter_id = ${req.userId}
          RETURNING *
        `;
      res.json({ addon: updated });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to update add-on');
      res.status(500).json({ error: 'Failed to update add-on' });
    }
  });

  // Remove an add-on
  router.delete('/addons/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [addon] = await sql`SELECT * FROM sitter_addons WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
      if (!addon) {
        res.status(404).json({ error: 'Add-on not found' });
        return;
      }
      await sql`DELETE FROM sitter_addons WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to delete add-on');
      res.status(500).json({ error: 'Failed to delete add-on' });
    }
  });
}
