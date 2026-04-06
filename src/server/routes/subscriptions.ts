import type { Router } from 'express';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { validate } from '../validation.ts';
import { createSubscriptionCheckout, createSubscriptionIntent, cancelStripeSubscription, getStripe } from '../payments.ts';
import { getOrCreateStripeCustomer } from '../stripe-customers.ts';
import logger, { sanitizeError } from '../logger.ts';
import { z } from 'zod';

const TIER_ORDER = { free: 0, pro: 1, premium: 2 } as const;

const upgradeSchema = z.object({
  tier: z.enum(['pro', 'premium'], { message: 'tier must be pro or premium' }),
});

function getPriceId(tier: 'pro' | 'premium'): string | undefined {
  if (tier === 'pro') return process.env.STRIPE_PRO_PRICE_ID;
  return process.env.STRIPE_PREMIUM_PRICE_ID;
}

export default function subscriptionRoutes(router: Router): void {
  router.get('/subscription', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [user] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
    if (!user.roles.includes('sitter')) {
      res.status(403).json({ error: 'Only sitters can view subscriptions' });
      return;
    }
    const [sub] = await sql`
      SELECT id, sitter_id, tier, status, stripe_subscription_id, current_period_start, current_period_end, created_at, updated_at
      FROM sitter_subscriptions WHERE sitter_id = ${req.userId}
    `;
    res.json({ subscription: sub || null });
  });

  // Create payment intent for subscription (supports pro and premium)
  router.post('/subscription/create-intent', authMiddleware, validate(upgradeSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT roles, email FROM users WHERE id = ${req.userId}`;
      if (!user.roles.includes('sitter')) {
        res.status(403).json({ error: 'Only sitters can subscribe' });
        return;
      }
      const { tier } = req.body;
      const [existing] = await sql`SELECT tier, status FROM sitter_subscriptions WHERE sitter_id = ${req.userId}`;
      const currentTier = (existing?.status === 'active' ? existing?.tier : 'free') || 'free';
      if (TIER_ORDER[tier as keyof typeof TIER_ORDER] <= TIER_ORDER[currentTier as keyof typeof TIER_ORDER]) {
        res.status(409).json({ error: `Already at ${currentTier} tier or higher` });
        return;
      }

      const priceId = getPriceId(tier);
      if (!priceId) {
        res.status(503).json({ error: 'Subscription payments not configured' });
        return;
      }
      const customerId = await getOrCreateStripeCustomer(req.userId!, user.email);

      // If upgrading from an existing Stripe subscription, update the subscription instead
      if (existing?.stripe_subscription_id && existing?.status === 'active') {
        const stripe = getStripe();
        const sub = await stripe.subscriptions.retrieve(existing.stripe_subscription_id);
        const updatedSub = await stripe.subscriptions.update(existing.stripe_subscription_id, {
          items: [{ id: sub.items.data[0].id, price: priceId }],
          proration_behavior: 'create_prorations',
        });

        await sql.begin(async (tx: any) => {
          await tx`
            UPDATE sitter_subscriptions SET tier = ${tier}, updated_at = NOW()
            WHERE sitter_id = ${req.userId}
          `;
          await tx`UPDATE users SET subscription_tier = ${tier} WHERE id = ${req.userId}`;
        });

        res.json({ subscription_id: updatedSub.id, upgraded: true });
        return;
      }

      const result = await createSubscriptionIntent(customerId, priceId);
      res.json(result);
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Subscription intent error');
      res.status(500).json({ error: 'Failed to create subscription' });
    }
  });

  // Upgrade via hosted checkout (fallback, or new subscriptions)
  router.post('/subscription/upgrade', authMiddleware, validate(upgradeSchema), async (req: AuthenticatedRequest, res) => {
    const [user] = await sql`SELECT roles, email FROM users WHERE id = ${req.userId}`;
    if (!user.roles.includes('sitter')) {
      res.status(403).json({ error: 'Only sitters can subscribe' });
      return;
    }

    const { tier } = req.body;
    const [existing] = await sql`SELECT id, tier, status, stripe_subscription_id FROM sitter_subscriptions WHERE sitter_id = ${req.userId}`;
    const currentTier = (existing?.status === 'active' ? existing?.tier : 'free') || 'free';
    if (TIER_ORDER[tier as keyof typeof TIER_ORDER] <= TIER_ORDER[currentTier as keyof typeof TIER_ORDER]) {
      res.status(409).json({ error: `Already at ${currentTier} tier or higher` });
      return;
    }

    try {
      // If upgrading existing Stripe subscription (e.g., pro → premium)
      if (existing?.stripe_subscription_id && existing?.status === 'active') {
        const priceId = getPriceId(tier);
        if (!priceId) throw new Error(`Price ID not configured for ${tier}`);

        const stripe = getStripe();
        const sub = await stripe.subscriptions.retrieve(existing.stripe_subscription_id);
        await stripe.subscriptions.update(existing.stripe_subscription_id, {
          items: [{ id: sub.items.data[0].id, price: priceId }],
          proration_behavior: 'create_prorations',
        });

        const [updated] = await sql.begin(async (tx: any) => {
          const [s] = await tx`
            UPDATE sitter_subscriptions SET tier = ${tier}, updated_at = NOW()
            WHERE sitter_id = ${req.userId}
            RETURNING id, sitter_id, tier, status, current_period_start, current_period_end, created_at, updated_at
          `;
          await tx`UPDATE users SET subscription_tier = ${tier} WHERE id = ${req.userId}`;
          return [s];
        });
        res.json({ subscription: updated });
        return;
      }

      // New subscription via hosted checkout
      const origin = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
      const checkoutUrl = await createSubscriptionCheckout(req.userId!, user.email, origin, tier);
      res.json({ checkout_url: checkoutUrl });
    } catch (error: any) {
      if (error.message?.includes('PRICE_ID') && process.env.NODE_ENV !== 'production') {
        // Dev/beta mode: activate directly without Stripe
        const tierUpdate = tier;
        if (existing) {
          const [updated] = await sql.begin(async (tx: any) => {
            const [s] = await tx`
              UPDATE sitter_subscriptions SET tier = ${tierUpdate}, status = 'active',
                current_period_start = NOW(), current_period_end = NOW() + INTERVAL '30 days', updated_at = NOW()
              WHERE sitter_id = ${req.userId}
              RETURNING id, sitter_id, tier, status, current_period_start, current_period_end, created_at, updated_at
            `;
            await tx`UPDATE users SET subscription_tier = ${tierUpdate} WHERE id = ${req.userId}`;
            return [s];
          });
          res.json({ subscription: updated });
        } else {
          const [sub] = await sql.begin(async (tx: any) => {
            const [s] = await tx`
              INSERT INTO sitter_subscriptions (sitter_id, tier, status, current_period_start, current_period_end)
              VALUES (${req.userId}, ${tierUpdate}, 'active', NOW(), NOW() + INTERVAL '30 days')
              RETURNING id, sitter_id, tier, status, current_period_start, current_period_end, created_at, updated_at
            `;
            await tx`UPDATE users SET subscription_tier = ${tierUpdate} WHERE id = ${req.userId}`;
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
  router.post('/subscription/downgrade', authMiddleware, validate(z.object({
    tier: z.enum(['free', 'pro'], { message: 'Can only downgrade to free or pro' }),
  })), async (req: AuthenticatedRequest, res) => {
    try {
      const { tier: targetTier } = req.body;
      const [existing] = await sql`
        SELECT id, tier, status, stripe_subscription_id
        FROM sitter_subscriptions WHERE sitter_id = ${req.userId} AND status = 'active'
      `;
      if (!existing) {
        res.status(404).json({ error: 'No active subscription' });
        return;
      }
      const currentOrder = TIER_ORDER[existing.tier as keyof typeof TIER_ORDER] ?? 0;
      const targetOrder = TIER_ORDER[targetTier as keyof typeof TIER_ORDER] ?? 0;
      if (targetOrder >= currentOrder) {
        res.status(400).json({ error: 'Target tier must be lower than current tier' });
        return;
      }

      if (targetTier === 'free') {
        // Cancel subscription entirely
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
        // Downgrade premium → pro: update Stripe subscription to Pro price
        const priceId = getPriceId('pro');
        if (existing.stripe_subscription_id && priceId) {
          const stripe = getStripe();
          const sub = await stripe.subscriptions.retrieve(existing.stripe_subscription_id);
          await stripe.subscriptions.update(existing.stripe_subscription_id, {
            items: [{ id: sub.items.data[0].id, price: priceId }],
            proration_behavior: 'create_prorations',
          });
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
