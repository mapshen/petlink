import type { Router } from 'express';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { validate } from '../validation.ts';
import { createSubscriptionCheckout, createSubscriptionIntent, cancelStripeSubscription, getStripe } from '../payments.ts';
import { getOrCreateStripeCustomer } from '../stripe-customers.ts';
import logger, { sanitizeError } from '../logger.ts';
import { z } from 'zod';

const TIER_ORDER: Record<string, number> = { free: 0, pro: 1, premium: 2 };

const upgradeSchema = z.object({
  tier: z.enum(['pro', 'premium'], { message: 'tier must be pro or premium' }),
});

const downgradeSchema = z.object({
  tier: z.enum(['free', 'pro'], { message: 'Can only downgrade to free or pro' }),
});

function getPriceId(tier: 'pro' | 'premium'): string | undefined {
  if (tier === 'pro') return process.env.STRIPE_PRO_PRICE_ID;
  return process.env.STRIPE_PREMIUM_PRICE_ID;
}

function getTierOrder(tier: string): number {
  return TIER_ORDER[tier] ?? 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function requireSitter(user: any, res: any): boolean {
  if (!user.roles.includes('sitter')) {
    res.status(403).json({ error: 'Only sitters can manage subscriptions' });
    return false;
  }
  return true;
}

/**
 * Update an existing Stripe subscription to a new price (for tier changes).
 * Does NOT update the DB — the webhook handles that after payment confirms.
 */
async function changeStripeSubscriptionPrice(
  stripeSubscriptionId: string,
  newTier: 'pro' | 'premium'
): Promise<string> {
  const priceId = getPriceId(newTier);
  if (!priceId) throw new Error(`STRIPE_${newTier.toUpperCase()}_PRICE_ID is not configured`);
  const stripe = getStripe();
  const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
  const updated = await stripe.subscriptions.update(stripeSubscriptionId, {
    items: [{ id: sub.items.data[0].id, price: priceId }],
    proration_behavior: 'create_prorations',
    metadata: { petlink_tier: newTier },
  });
  return updated.id;
}

export default function subscriptionRoutes(router: Router): void {
  router.get('/subscription', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
      if (!requireSitter(user, res)) return;
      const [sub] = await sql`
        SELECT id, sitter_id, tier, status, stripe_subscription_id, current_period_start, current_period_end, created_at, updated_at
        FROM sitter_subscriptions WHERE sitter_id = ${req.userId}
      `;
      res.json({ subscription: sub || null });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Subscription fetch error');
      res.status(500).json({ error: 'Failed to load subscription' });
    }
  });

  // Create payment intent for new subscription or upgrade existing
  router.post('/subscription/create-intent', authMiddleware, validate(upgradeSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT roles, email FROM users WHERE id = ${req.userId}`;
      if (!requireSitter(user, res)) return;

      const { tier } = req.body;
      const [existing] = await sql`SELECT tier, status, stripe_subscription_id FROM sitter_subscriptions WHERE sitter_id = ${req.userId}`;
      const currentTier = (existing?.status === 'active' ? existing?.tier : 'free') || 'free';
      if (getTierOrder(tier) <= getTierOrder(currentTier)) {
        res.status(409).json({ error: `Already at ${currentTier} tier or higher` });
        return;
      }

      const priceId = getPriceId(tier);
      if (!priceId) {
        res.status(503).json({ error: 'Subscription payments not configured' });
        return;
      }
      const customerId = await getOrCreateStripeCustomer(req.userId!, user.email);

      // Upgrade existing Stripe subscription — DB update deferred to webhook
      if (existing?.stripe_subscription_id && existing?.status === 'active') {
        const subId = await changeStripeSubscriptionPrice(existing.stripe_subscription_id, tier);
        res.json({ subscription_id: subId, pending: true });
        return;
      }

      const result = await createSubscriptionIntent(customerId, priceId);
      res.json(result);
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Subscription intent error');
      res.status(500).json({ error: 'Failed to create subscription' });
    }
  });

  // Upgrade via hosted checkout or Stripe subscription update
  router.post('/subscription/upgrade', authMiddleware, validate(upgradeSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT roles, email FROM users WHERE id = ${req.userId}`;
      if (!requireSitter(user, res)) return;

      const { tier } = req.body;
      const [existing] = await sql`SELECT id, tier, status, stripe_subscription_id FROM sitter_subscriptions WHERE sitter_id = ${req.userId}`;
      const currentTier = (existing?.status === 'active' ? existing?.tier : 'free') || 'free';
      if (getTierOrder(tier) <= getTierOrder(currentTier)) {
        res.status(409).json({ error: `Already at ${currentTier} tier or higher` });
        return;
      }

      // Upgrade existing Stripe subscription — DB update deferred to webhook
      if (existing?.stripe_subscription_id && existing?.status === 'active') {
        const subId = await changeStripeSubscriptionPrice(existing.stripe_subscription_id, tier);
        res.json({ subscription_id: subId, pending: true });
        return;
      }

      // New subscription via hosted checkout
      const origin = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
      const checkoutUrl = await createSubscriptionCheckout(req.userId!, user.email, origin, tier);
      res.json({ checkout_url: checkoutUrl });
    } catch (error: any) {
      if (error.message?.includes('PRICE_ID') && process.env.NODE_ENV !== 'production') {
        // Dev/beta mode: activate directly without Stripe
        const [existing] = await sql`SELECT id FROM sitter_subscriptions WHERE sitter_id = ${req.userId}`;
        if (existing) {
          const [updated] = await sql.begin(async (tx: any) => {
            const [s] = await tx`
              UPDATE sitter_subscriptions SET tier = ${req.body.tier}, status = 'active',
                current_period_start = NOW(), current_period_end = NOW() + INTERVAL '30 days', updated_at = NOW()
              WHERE sitter_id = ${req.userId}
              RETURNING id, sitter_id, tier, status, current_period_start, current_period_end, created_at, updated_at
            `;
            await tx`UPDATE users SET subscription_tier = ${req.body.tier} WHERE id = ${req.userId}`;
            return [s];
          });
          res.json({ subscription: updated });
        } else {
          const [sub] = await sql.begin(async (tx: any) => {
            const [s] = await tx`
              INSERT INTO sitter_subscriptions (sitter_id, tier, status, current_period_start, current_period_end)
              VALUES (${req.userId}, ${req.body.tier}, 'active', NOW(), NOW() + INTERVAL '30 days')
              RETURNING id, sitter_id, tier, status, current_period_start, current_period_end, created_at, updated_at
            `;
            await tx`UPDATE users SET subscription_tier = ${req.body.tier} WHERE id = ${req.userId}`;
            return [s];
          });
          res.status(201).json({ subscription: sub });
        }
        return;
      }
      logger.error({ err: sanitizeError(error) }, 'Subscription upgrade error');
      res.status(500).json({ error: 'Failed to start subscription checkout' });
    }
  });

  // Downgrade to a lower tier
  router.post('/subscription/downgrade', authMiddleware, validate(downgradeSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
      if (!requireSitter(user, res)) return;

      const { tier: targetTier } = req.body;
      const [existing] = await sql`
        SELECT id, tier, status, stripe_subscription_id
        FROM sitter_subscriptions WHERE sitter_id = ${req.userId} AND status = 'active'
      `;
      if (!existing) {
        res.status(404).json({ error: 'No active subscription' });
        return;
      }
      if (getTierOrder(targetTier) >= getTierOrder(existing.tier)) {
        res.status(400).json({ error: 'Target tier must be lower than current tier' });
        return;
      }

      if (targetTier === 'free') {
        if (existing.stripe_subscription_id) {
          try {
            await cancelStripeSubscription(existing.stripe_subscription_id);
          } catch (error) {
            logger.error({ err: sanitizeError(error) }, 'Stripe cancel error on downgrade');
          }
        }
        const [updated] = await sql.begin(async (tx: any) => {
          const [s] = await tx`
            UPDATE sitter_subscriptions SET status = 'cancelled', tier = 'free', updated_at = NOW()
            WHERE sitter_id = ${req.userId}
            RETURNING id, sitter_id, tier, status, current_period_start, current_period_end, created_at, updated_at
          `;
          await tx`UPDATE users SET subscription_tier = 'free' WHERE id = ${req.userId}`;
          return [s];
        });
        res.json({ subscription: updated });
      } else {
        // Downgrade premium → pro
        if (existing.stripe_subscription_id) {
          await changeStripeSubscriptionPrice(existing.stripe_subscription_id, 'pro');
        }
        const [updated] = await sql.begin(async (tx: any) => {
          const [s] = await tx`
            UPDATE sitter_subscriptions SET tier = 'pro', updated_at = NOW()
            WHERE sitter_id = ${req.userId}
            RETURNING id, sitter_id, tier, status, current_period_start, current_period_end, created_at, updated_at
          `;
          await tx`UPDATE users SET subscription_tier = 'pro' WHERE id = ${req.userId}`;
          return [s];
        });
        res.json({ subscription: updated });
      }
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Subscription downgrade error');
      res.status(500).json({ error: 'Failed to downgrade subscription' });
    }
  });

  // Cancel subscription (drops to free)
  router.post('/subscription/cancel', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
      if (!requireSitter(user, res)) return;

      const [sub] = await sql`
        SELECT id, stripe_subscription_id
        FROM sitter_subscriptions WHERE sitter_id = ${req.userId} AND tier != 'free' AND status = 'active'
      `;
      if (!sub) {
        res.status(404).json({ error: 'No active paid subscription' });
        return;
      }

      if (sub.stripe_subscription_id) {
        try {
          await cancelStripeSubscription(sub.stripe_subscription_id);
        } catch (error) {
          logger.error({ err: sanitizeError(error) }, 'Stripe cancel error');
        }
      }

      const [updated] = await sql.begin(async (tx: any) => {
        const [s] = await tx`
          UPDATE sitter_subscriptions SET status = 'cancelled', tier = 'free', updated_at = NOW()
          WHERE sitter_id = ${req.userId}
          RETURNING id, sitter_id, tier, status, current_period_start, current_period_end, created_at, updated_at
        `;
        await tx`UPDATE users SET subscription_tier = 'free' WHERE id = ${req.userId}`;
        return [s];
      });
      res.json({ subscription: updated });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Subscription cancel error');
      res.status(500).json({ error: 'Failed to cancel subscription' });
    }
  });
}
