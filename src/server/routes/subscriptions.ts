import type { Router } from 'express';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { validate, emptyBodySchema } from '../validation.ts';
import { createSubscriptionCheckout, createSubscriptionIntent, cancelStripeSubscription } from '../payments.ts';
import { getOrCreateStripeCustomer } from '../stripe-customers.ts';

export default function subscriptionRoutes(router: Router): void {
  router.get('/subscription', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [user] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
    if (!user.roles.includes('sitter')) {
      res.status(403).json({ error: 'Only sitters can view subscriptions' });
      return;
    }
    const [sub] = await sql`
      SELECT id, sitter_id, tier, status, current_period_start, current_period_end, created_at, updated_at
      FROM sitter_subscriptions WHERE sitter_id = ${req.userId}
    `;
    res.json({ subscription: sub || null });
  });

  router.post('/subscription/create-intent', authMiddleware, validate(emptyBodySchema), async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT roles, email FROM users WHERE id = ${req.userId}`;
      if (!user.roles.includes('sitter')) {
        res.status(403).json({ error: 'Only sitters can subscribe' });
        return;
      }
      const [existing] = await sql`SELECT tier FROM sitter_subscriptions WHERE sitter_id = ${req.userId}`;
      if (existing && existing.tier === 'pro') {
        res.status(409).json({ error: 'Already subscribed to Pro' });
        return;
      }
      const priceId = process.env.STRIPE_PRO_PRICE_ID;
      if (!priceId) {
        res.status(503).json({ error: 'Subscription payments not configured' });
        return;
      }
      const customerId = await getOrCreateStripeCustomer(req.userId!, user.email);
      const result = await createSubscriptionIntent(customerId, priceId);
      res.json(result);
    } catch (error) {
      console.error('Subscription intent error:', error);
      res.status(500).json({ error: 'Failed to create subscription' });
    }
  });

  router.post('/subscription/upgrade', authMiddleware, validate(emptyBodySchema), async (req: AuthenticatedRequest, res) => {
    const [user] = await sql`SELECT roles, email FROM users WHERE id = ${req.userId}`;
    if (!user.roles.includes('sitter')) {
      res.status(403).json({ error: 'Only sitters can subscribe' });
      return;
    }

    const [existing] = await sql`SELECT id, tier FROM sitter_subscriptions WHERE sitter_id = ${req.userId}`;
    if (existing && existing.tier === 'pro') {
      res.status(409).json({ error: 'Already subscribed to Pro' });
      return;
    }

    try {
      const origin = `${req.protocol}://${req.get('host')}`;
      const checkoutUrl = await createSubscriptionCheckout(req.userId!, user.email, origin);
      res.json({ checkout_url: checkoutUrl });
    } catch (error: any) {
      if (error.message?.includes('STRIPE_PRO_PRICE_ID')) {
        // Stripe not configured — activate directly (dev/beta mode)
        if (existing) {
          const [updated] = await sql.begin(async (tx: any) => {
            const [s] = await tx`
              UPDATE sitter_subscriptions SET tier = 'pro', status = 'active',
                current_period_start = NOW(), current_period_end = NOW() + INTERVAL '30 days', updated_at = NOW()
              WHERE sitter_id = ${req.userId}
              RETURNING id, sitter_id, tier, status, current_period_start, current_period_end, created_at, updated_at
            `;
            await tx`UPDATE users SET subscription_tier = 'pro' WHERE id = ${req.userId}`;
            return [s];
          });
          res.json({ subscription: updated });
        } else {
          const [sub] = await sql.begin(async (tx: any) => {
            const [s] = await tx`
              INSERT INTO sitter_subscriptions (sitter_id, tier, status, current_period_start, current_period_end)
              VALUES (${req.userId}, 'pro', 'active', NOW(), NOW() + INTERVAL '30 days')
              RETURNING id, sitter_id, tier, status, current_period_start, current_period_end, created_at, updated_at
            `;
            await tx`UPDATE users SET subscription_tier = 'pro' WHERE id = ${req.userId}`;
            return [s];
          });
          res.status(201).json({ subscription: sub });
        }
        return;
      }
      throw error;
    }
  });

  router.post('/subscription/cancel', authMiddleware, validate(emptyBodySchema), async (req: AuthenticatedRequest, res) => {
    const [sub] = await sql`
      SELECT id, stripe_subscription_id
      FROM sitter_subscriptions WHERE sitter_id = ${req.userId} AND tier = 'pro' AND status = 'active'
    `;
    if (!sub) {
      res.status(404).json({ error: 'No active Pro subscription' });
      return;
    }

    // Cancel via Stripe if subscription was created through Stripe
    if (sub.stripe_subscription_id) {
      try {
        await cancelStripeSubscription(sub.stripe_subscription_id);
      } catch (error) {
        console.error('Stripe cancel error:', error);
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
  });
}
