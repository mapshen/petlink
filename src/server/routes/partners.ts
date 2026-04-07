import type { Router } from 'express';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { adminMiddleware } from '../admin.ts';
import { validate, partnerSchema, partnerOfferSchema, addCouponCodesSchema } from '../validation.ts';
import { applyCredits } from '../credits.ts';
import { sendEmail, buildCouponRedemptionEmail } from '../email.ts';
import logger, { sanitizeError } from '../logger.ts';
import crypto from 'crypto';

export default function partnerRoutes(router: Router): void {
  // --- Public (authenticated) ---

  // List active partner offers
  router.get('/partners/offers', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const offers = await sql`
        SELECT po.id, po.title, po.description, po.credit_cost_cents, po.offer_value_description,
               po.max_redemptions_per_user, po.coupon_auto_generate, po.active,
               p.name as partner_name, p.logo_url as partner_logo_url, p.website_url as partner_website_url,
               (SELECT COUNT(*)::int FROM coupon_redemptions cr WHERE cr.offer_id = po.id AND cr.user_id = ${req.userId}) as user_redemption_count,
               CASE WHEN po.coupon_auto_generate THEN true
                    ELSE array_length(po.coupon_pool, 1) > 0
               END as available
        FROM partner_offers po
        JOIN partners p ON p.id = po.partner_id AND p.active = true
        WHERE po.active = true
        ORDER BY p.name, po.title
      `;

      const enriched = offers.map((o: any) => ({
        ...o,
        already_redeemed: o.user_redemption_count >= (o.max_redemptions_per_user || 1),
      }));

      res.json({ offers: enriched });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch partner offers');
      res.status(500).json({ error: 'Failed to fetch partner offers' });
    }
  });

  // Redeem a partner offer
  router.post('/partners/offers/:id/redeem', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const offerId = Number(req.params.id);
      if (!Number.isInteger(offerId) || offerId <= 0) {
        res.status(400).json({ error: 'Invalid offer ID' });
        return;
      }

      // Fetch offer with FOR UPDATE to prevent race conditions
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await sql.begin(async (tx: any) => {
        const [offer] = await tx`
          SELECT po.*, p.name as partner_name, p.website_url as partner_website_url
          FROM partner_offers po
          JOIN partners p ON p.id = po.partner_id
          WHERE po.id = ${offerId} AND po.active = true AND p.active = true
          FOR UPDATE OF po
        `;
        if (!offer) {
          return { error: 'Offer not found or inactive', status: 404 };
        }

        // Check max redemptions per user
        const [{ count: redemptionCount }] = await tx`
          SELECT COUNT(*)::int as count FROM coupon_redemptions
          WHERE offer_id = ${offerId} AND user_id = ${req.userId}
        `;
        if (redemptionCount >= (offer.max_redemptions_per_user || 1)) {
          return { error: 'You have already redeemed this offer', status: 409 };
        }

        // Get a coupon code
        let couponCode: string;
        if (offer.coupon_auto_generate) {
          couponCode = `${offer.coupon_prefix || 'PL'}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
        } else {
          // Pop from pool
          if (!offer.coupon_pool || offer.coupon_pool.length === 0) {
            return { error: 'No coupon codes available for this offer', status: 409 };
          }
          couponCode = offer.coupon_pool[0];
          await tx`
            UPDATE partner_offers
            SET coupon_pool = coupon_pool[2:], total_redemptions = total_redemptions + 1
            WHERE id = ${offerId}
          `;
        }

        // Deduct credits
        const creditEntry = await applyCreditsInTx(
          tx, req.userId!, offer.credit_cost_cents,
          `Redeemed: ${offer.title} (${offer.partner_name})`, 'system'
        );

        // Record redemption
        await tx`
          INSERT INTO coupon_redemptions (user_id, offer_id, coupon_code, credit_ledger_entry_id)
          VALUES (${req.userId}, ${offerId}, ${couponCode}, ${creditEntry.id})
        `;

        if (offer.coupon_auto_generate) {
          await tx`
            UPDATE partner_offers SET total_redemptions = total_redemptions + 1
            WHERE id = ${offerId}
          `;
        }

        return {
          coupon_code: couponCode,
          offer_title: offer.title,
          partner_name: offer.partner_name,
          partner_website_url: offer.partner_website_url,
        };
      });

      if ('error' in result) {
        res.status(result.status).json({ error: result.error });
        return;
      }

      // Send email with coupon code (best-effort)
      const [user] = await sql`SELECT email, name FROM users WHERE id = ${req.userId}`;
      if (user) {
        const emailContent = buildCouponRedemptionEmail({
          userName: user.name,
          offerTitle: result.offer_title,
          couponCode: result.coupon_code,
          partnerName: result.partner_name,
          partnerWebsite: result.partner_website_url,
        });
        sendEmail({ to: user.email, ...emailContent }).catch(() => {});
      }

      res.json(result);
    } catch (error) {
      if ((error as Error).message === 'Insufficient credit balance') {
        res.status(400).json({ error: 'Insufficient credit balance' });
        return;
      }
      logger.error({ err: sanitizeError(error) }, 'Failed to redeem partner offer');
      res.status(500).json({ error: 'Failed to redeem offer' });
    }
  });

  // --- Admin ---

  router.get('/admin/partners', adminMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const partners = await sql`
        SELECT p.*,
               (SELECT COUNT(*)::int FROM partner_offers po WHERE po.partner_id = p.id) as offer_count,
               (SELECT COALESCE(SUM(po.total_redemptions), 0)::int FROM partner_offers po WHERE po.partner_id = p.id) as total_redemptions
        FROM partners p
        ORDER BY p.created_at DESC
      `;
      res.json({ partners });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch partners');
      res.status(500).json({ error: 'Failed to fetch partners' });
    }
  });

  router.post('/admin/partners', adminMiddleware, validate(partnerSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const { name, logo_url, website_url } = req.body;
      const [partner] = await sql`
        INSERT INTO partners (name, logo_url, website_url)
        VALUES (${name}, ${logo_url ?? null}, ${website_url ?? null})
        RETURNING *
      `;
      res.status(201).json({ partner });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to create partner');
      res.status(500).json({ error: 'Failed to create partner' });
    }
  });

  router.put('/admin/partners/:id', adminMiddleware, validate(partnerSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const partnerId = Number(req.params.id);
      const { name, logo_url, website_url } = req.body;
      const [partner] = await sql`
        UPDATE partners SET name = ${name}, logo_url = ${logo_url ?? null}, website_url = ${website_url ?? null}, updated_at = NOW()
        WHERE id = ${partnerId}
        RETURNING *
      `;
      if (!partner) {
        res.status(404).json({ error: 'Partner not found' });
        return;
      }
      res.json({ partner });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to update partner');
      res.status(500).json({ error: 'Failed to update partner' });
    }
  });

  router.post('/admin/partners/:partnerId/offers', adminMiddleware, validate(partnerOfferSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const partnerId = Number(req.params.partnerId);
      const [partner] = await sql`SELECT id FROM partners WHERE id = ${partnerId}`;
      if (!partner) {
        res.status(404).json({ error: 'Partner not found' });
        return;
      }
      const { title, description, credit_cost_cents, offer_value_description, max_redemptions_per_user } = req.body;
      const [offer] = await sql`
        INSERT INTO partner_offers (partner_id, title, description, credit_cost_cents, offer_value_description, max_redemptions_per_user)
        VALUES (${partnerId}, ${title}, ${description ?? null}, ${credit_cost_cents}, ${offer_value_description}, ${max_redemptions_per_user || 1})
        RETURNING *
      `;
      res.status(201).json({ offer });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to create offer');
      res.status(500).json({ error: 'Failed to create offer' });
    }
  });

  router.post('/admin/partners/offers/:id/add-codes', adminMiddleware, validate(addCouponCodesSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const offerId = Number(req.params.id);
      const { codes } = req.body;
      const [offer] = await sql`
        UPDATE partner_offers
        SET coupon_pool = coupon_pool || ${codes}::text[]
        WHERE id = ${offerId}
        RETURNING id, array_length(coupon_pool, 1) as pool_size
      `;
      if (!offer) {
        res.status(404).json({ error: 'Offer not found' });
        return;
      }
      res.json({ offer_id: offer.id, pool_size: offer.pool_size });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to add codes');
      res.status(500).json({ error: 'Failed to add codes' });
    }
  });

  router.get('/admin/partners/offers/:id/redemptions', adminMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const offerId = Number(req.params.id);
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);

      const redemptions = await sql`
        SELECT cr.*, u.name as user_name, u.email as user_email
        FROM coupon_redemptions cr
        JOIN users u ON u.id = cr.user_id
        WHERE cr.offer_id = ${offerId}
        ORDER BY cr.redeemed_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      res.json({ redemptions });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch redemptions');
      res.status(500).json({ error: 'Failed to fetch redemptions' });
    }
  });
}

/**
 * Apply credits within an existing transaction.
 * Similar to applyCredits but uses the provided tx handle.
 */
async function applyCreditsInTx(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  userId: number,
  amountCents: number,
  description: string,
  sourceType: string
): Promise<{ id: number }> {
  const [{ balance }] = await tx`
    SELECT COALESCE(SUM(amount_cents), 0)::int AS balance
    FROM credit_ledger
    WHERE user_id = ${userId}
      AND (expires_at IS NULL OR expires_at > NOW())
    FOR UPDATE
  `;

  if (balance < amountCents) {
    throw new Error('Insufficient credit balance');
  }

  const [entry] = await tx`
    INSERT INTO credit_ledger (user_id, amount_cents, type, source_type, description)
    VALUES (${userId}, ${-amountCents}, 'redemption', ${sourceType}, ${description})
    RETURNING id
  `;
  return entry;
}
