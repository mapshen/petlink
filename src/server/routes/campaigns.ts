import type { Router } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { validate } from '../validation.ts';
import { z } from 'zod';
import sql from '../db.ts';
import {
  createCampaign,
  sendCampaign,
  getCampaigns,
  getCampaignRecipients,
  canSendCampaign,
  getClients,
  recordOpen,
  recordClick,
  HOLIDAY_TEMPLATES,
  VALID_AUDIENCES,
  MAX_SUBJECT_LENGTH,
  MAX_BODY_LENGTH,
} from '../campaigns.ts';
import type { CampaignAudience } from '../../types.ts';
import logger, { sanitizeError } from '../logger.ts';

const createCampaignSchema = z.object({
  type: z.enum(['holiday', 'marketing']),
  subject: z.string().min(1).max(MAX_SUBJECT_LENGTH),
  body: z.string().min(1).max(MAX_BODY_LENGTH),
  audience: z.enum(['all_clients', 'recent_clients', 'specific_clients']).default('all_clients'),
  specific_client_ids: z.array(z.number().int().positive()).max(500).optional(),
  discount_code: z.string().max(50).optional(),
  discount_percent: z.number().int().min(1).max(50).optional(),
  holiday_name: z.string().max(100).optional(),
});

async function requireSitter(req: AuthenticatedRequest, res: any): Promise<boolean> {
  const [user] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
  if (!user?.roles.includes('sitter')) {
    res.status(403).json({ error: 'Only sitters can access CRM' });
    return false;
  }
  return true;
}

export default function campaignRoutes(router: Router): void {
  // Get holiday templates
  router.get('/campaigns/templates', authMiddleware, async (req: AuthenticatedRequest, res) => {
    if (!(await requireSitter(req, res))) return;
    res.json({ templates: HOLIDAY_TEMPLATES });
  });

  // Check remaining campaigns this month
  router.get('/campaigns/limit', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      if (!(await requireSitter(req, res))) return;
      const result = await canSendCampaign(req.userId!);
      res.json(result);
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to check campaign limit');
      res.status(500).json({ error: 'Failed to check limit' });
    }
  });

  // Get past clients for audience targeting
  router.get('/campaigns/clients', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      if (!(await requireSitter(req, res))) return;
      const rawAudience = req.query.audience as string;
      const audience: CampaignAudience = VALID_AUDIENCES.includes(rawAudience as CampaignAudience)
        ? rawAudience as CampaignAudience
        : 'all_clients';
      const clients = await getClients(req.userId!, audience);
      res.json({ clients });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to load clients');
      res.status(500).json({ error: 'Failed to load clients' });
    }
  });

  // List campaigns
  router.get('/campaigns', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      if (!(await requireSitter(req, res))) return;
      const campaigns = await getCampaigns(req.userId!);
      res.json({ campaigns });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to load campaigns');
      res.status(500).json({ error: 'Failed to load campaigns' });
    }
  });

  // Create campaign draft
  router.post('/campaigns', authMiddleware, validate(createCampaignSchema), async (req: AuthenticatedRequest, res) => {
    try {
      if (!(await requireSitter(req, res))) return;
      const campaign = await createCampaign({ ...req.body, sitter_id: req.userId! });
      res.status(201).json({ campaign });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to create campaign');
      res.status(500).json({ error: 'Failed to create campaign' });
    }
  });

  // Send campaign
  router.post('/campaigns/:id/send', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      if (!(await requireSitter(req, res))) return;
      const result = await sendCampaign(Number(req.params.id), req.userId!);
      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }
      res.json({ success: true, recipient_count: result.recipientCount });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to send campaign');
      res.status(500).json({ error: 'Failed to send campaign' });
    }
  });

  // Cancel draft campaign
  router.put('/campaigns/:id/cancel', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      if (!(await requireSitter(req, res))) return;
      const [campaign] = await sql`
        SELECT id, status FROM campaigns WHERE id = ${req.params.id} AND sitter_id = ${req.userId}
      `;
      if (!campaign) {
        res.status(404).json({ error: 'Campaign not found' });
        return;
      }
      if (campaign.status !== 'draft') {
        res.status(400).json({ error: 'Only draft campaigns can be cancelled' });
        return;
      }
      await sql`UPDATE campaigns SET status = 'cancelled' WHERE id = ${req.params.id}`;
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to cancel campaign');
      res.status(500).json({ error: 'Failed to cancel campaign' });
    }
  });

  // Get campaign recipients (analytics)
  router.get('/campaigns/:id/recipients', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      if (!(await requireSitter(req, res))) return;
      const recipients = await getCampaignRecipients(Number(req.params.id), req.userId!);
      res.json({ recipients });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to load campaign recipients');
      res.status(500).json({ error: 'Failed to load recipients' });
    }
  });

  // Track open (called when recipient views campaign message)
  router.post('/campaigns/:id/open', authMiddleware, async (req: AuthenticatedRequest, res) => {
    await recordOpen(Number(req.params.id), req.userId!).catch(() => {});
    res.json({ success: true });
  });

  // Track click (called when recipient clicks CTA)
  router.post('/campaigns/:id/click', authMiddleware, async (req: AuthenticatedRequest, res) => {
    await recordClick(Number(req.params.id), req.userId!).catch(() => {});
    res.json({ success: true });
  });
}
