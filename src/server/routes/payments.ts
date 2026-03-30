import type { Router } from 'express';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { validate, paymentIntentSchema, paymentActionSchema } from '../validation.ts';
import { createPaymentIntent, capturePayment, cancelPayment, constructWebhookEvent, listPaymentMethods, detachPaymentMethod, listCharges, createFinancialConnectionsSession, listBankAccounts, detachBankAccount } from '../payments.ts';
import { getPayoutsForSitter, getPendingPayoutsForSitter } from '../payouts.ts';
import { createNotification } from '../notifications.ts';

export default function paymentRoutes(router: Router): void {
  // --- Payments (direct — no Stripe Connect) ---
  router.post('/payments/create-intent', authMiddleware, validate(paymentIntentSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const { booking_id } = req.body;
      const [booking] = await sql`SELECT * FROM bookings WHERE id = ${booking_id} AND owner_id = ${req.userId}`;
      if (!booking) {
        res.status(404).json({ error: 'Booking not found' });
        return;
      }
      if (booking.payment_intent_id) {
        res.status(409).json({ error: 'Payment already initiated for this booking' });
        return;
      }
      const amountCents = Math.round(booking.total_price * 100);
      if (amountCents <= 0) {
        res.status(400).json({ error: 'No payment required for free bookings' });
        return;
      }
      const { clientSecret, paymentIntentId } = await createPaymentIntent(amountCents);
      await sql`UPDATE bookings SET payment_intent_id = ${paymentIntentId}, payment_status = 'held' WHERE id = ${booking_id}`;
      res.json({ clientSecret, paymentIntentId });
    } catch (error) {
      console.error('Payment intent error:', error);
      res.status(500).json({ error: 'Failed to create payment' });
    }
  });

  router.post('/payments/capture', authMiddleware, validate(paymentActionSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const { booking_id } = req.body;
      const [booking] = await sql`
        SELECT * FROM bookings WHERE id = ${booking_id} AND owner_id = ${req.userId} AND payment_status = 'held'
      `;
      if (!booking) {
        res.status(404).json({ error: 'Booking not found or payment not held' });
        return;
      }
      await capturePayment(booking.payment_intent_id);
      await sql`UPDATE bookings SET payment_status = 'captured' WHERE id = ${booking_id}`;
      await createNotification(booking.owner_id, 'payment_update', 'Payment Captured', 'Your payment has been processed.', { booking_id });
      res.json({ success: true });
    } catch (error) {
      console.error('Payment capture error:', error);
      res.status(500).json({ error: 'Failed to capture payment' });
    }
  });

  router.post('/payments/cancel', authMiddleware, validate(paymentActionSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const { booking_id } = req.body;
      const [booking] = await sql`
        SELECT * FROM bookings WHERE id = ${booking_id} AND owner_id = ${req.userId} AND payment_status = 'held'
      `;
      if (!booking) {
        res.status(404).json({ error: 'Booking not found or payment not held' });
        return;
      }
      await cancelPayment(booking.payment_intent_id);
      await sql`UPDATE bookings SET payment_status = 'cancelled', status = 'cancelled' WHERE id = ${booking_id}`;
      res.json({ success: true });
    } catch (error) {
      console.error('Payment cancel error:', error);
      res.status(500).json({ error: 'Failed to cancel payment' });
    }
  });

  // --- Payouts ---
  router.get('/payouts', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [user] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
    if (!user.roles.includes('sitter')) {
      res.status(403).json({ error: 'Only sitters can view payouts' });
      return;
    }
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const payouts = await getPayoutsForSitter(req.userId!, limit, offset);
    res.json({ payouts });
  });

  router.get('/payouts/pending', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [user] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
    if (!user.roles.includes('sitter')) {
      res.status(403).json({ error: 'Only sitters can view payouts' });
      return;
    }
    const payouts = await getPendingPayoutsForSitter(req.userId!);
    res.json({ payouts });
  });

  // --- Stripe Webhook ---
  router.post('/webhooks/stripe', async (req, res) => {
    const sig = req.headers['stripe-signature'];
    if (!sig) {
      res.status(400).json({ error: 'Missing stripe-signature header' });
      return;
    }
    try {
      const event = constructWebhookEvent(req.body, sig as string);
      switch (event.type) {
        case 'payment_intent.succeeded': {
          const pi = event.data.object as { id: string };
          await sql`UPDATE bookings SET payment_status = 'captured' WHERE payment_intent_id = ${pi.id}`;
          const [succeededBooking] = await sql`SELECT id, owner_id FROM bookings WHERE payment_intent_id = ${pi.id}`;
          if (succeededBooking) {
            await createNotification(succeededBooking.owner_id, 'payment_update', 'Payment Captured', 'Your payment has been processed.', { booking_id: succeededBooking.id });
          }
          break;
        }
        case 'payment_intent.canceled': {
          const pi = event.data.object as { id: string };
          await sql`UPDATE bookings SET payment_status = 'cancelled' WHERE payment_intent_id = ${pi.id}`;
          const [cancelledBooking] = await sql`SELECT id, owner_id FROM bookings WHERE payment_intent_id = ${pi.id}`;
          if (cancelledBooking) {
            await createNotification(cancelledBooking.owner_id, 'payment_update', 'Payment Failed', 'Your payment could not be processed. Please update your payment method.', { booking_id: cancelledBooking.id });
          }
          break;
        }
        case 'checkout.session.completed': {
          const session = event.data.object as {
            mode: string;
            subscription: string;
            metadata: { petlink_user_id?: string };
          };
          if (session.mode === 'subscription' && session.metadata?.petlink_user_id) {
            const userId = Number(session.metadata.petlink_user_id);
            const stripeSubId = session.subscription;
            const [existing] = await sql`SELECT id FROM sitter_subscriptions WHERE sitter_id = ${userId}`;
            if (existing) {
              await sql.begin(async (tx: any) => {
                await tx`
                  UPDATE sitter_subscriptions SET tier = 'pro', status = 'active',
                    stripe_subscription_id = ${stripeSubId},
                    current_period_start = NOW(), current_period_end = NOW() + INTERVAL '30 days', updated_at = NOW()
                  WHERE sitter_id = ${userId}
                `;
                await tx`UPDATE users SET subscription_tier = 'pro' WHERE id = ${userId}`;
              });
            } else {
              await sql.begin(async (tx: any) => {
                await tx`
                  INSERT INTO sitter_subscriptions (sitter_id, tier, status, stripe_subscription_id, current_period_start, current_period_end)
                  VALUES (${userId}, 'pro', 'active', ${stripeSubId}, NOW(), NOW() + INTERVAL '30 days')
                `;
                await tx`UPDATE users SET subscription_tier = 'pro' WHERE id = ${userId}`;
              });
            }
          }
          break;
        }
        case 'customer.subscription.deleted': {
          const sub = event.data.object as { id: string };
          const [existing] = await sql`SELECT sitter_id FROM sitter_subscriptions WHERE stripe_subscription_id = ${sub.id}`;
          if (existing) {
            await sql.begin(async (tx: any) => {
              await tx`
                UPDATE sitter_subscriptions SET status = 'cancelled', tier = 'free', updated_at = NOW()
                WHERE stripe_subscription_id = ${sub.id}
              `;
              await tx`UPDATE users SET subscription_tier = 'free' WHERE id = ${existing.sitter_id}`;
            });
          }
          break;
        }
        case 'invoice.payment_failed': {
          const invoice = event.data.object as unknown as { subscription: string };
          if (invoice.subscription) {
            await sql`
              UPDATE sitter_subscriptions SET status = 'past_due', updated_at = NOW()
              WHERE stripe_subscription_id = ${invoice.subscription}
            `;
          }
          break;
        }
      }
      res.json({ received: true });
    } catch (error) {
      console.error('Stripe webhook error:', error);
      res.status(400).json({ error: 'Webhook verification failed' });
    }
  });

  // --- Payment Management ---
  router.get('/payment-methods', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT stripe_customer_id FROM users WHERE id = ${req.userId}`;
      if (!user?.stripe_customer_id) {
        res.json({ payment_methods: [] });
        return;
      }
      const methods = await listPaymentMethods(user.stripe_customer_id);
      res.json({ payment_methods: methods });
    } catch (error) {
      console.error('Payment methods error:', error);
      res.status(500).json({ error: 'Failed to load payment methods' });
    }
  });

  router.delete('/payment-methods/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.params.id || !/^pm_/.test(req.params.id)) {
        res.status(400).json({ error: 'Invalid payment method ID' });
        return;
      }
      const [user] = await sql`SELECT stripe_customer_id FROM users WHERE id = ${req.userId}`;
      if (!user?.stripe_customer_id) {
        res.status(404).json({ error: 'No payment methods found' });
        return;
      }
      // Verify ownership by retrieving the specific payment method
      const methods = await listPaymentMethods(user.stripe_customer_id);
      const owns = methods.some((m) => m.id === req.params.id);
      if (!owns) {
        res.status(404).json({ error: 'Payment method not found' });
        return;
      }
      await detachPaymentMethod(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Delete payment method error:', error);
      res.status(500).json({ error: 'Failed to remove payment method' });
    }
  });

  router.get('/payment-history', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT stripe_customer_id FROM users WHERE id = ${req.userId}`;
      if (!user?.stripe_customer_id) {
        res.json({ payments: [] });
        return;
      }
      const limit = Math.min(Number(req.query.limit) || 20, 100);
      const payments = await listCharges(user.stripe_customer_id, limit);
      res.json({ payments });
    } catch (error) {
      console.error('Payment history error:', error);
      res.status(500).json({ error: 'Failed to load payment history' });
    }
  });

  // --- ACH Bank Transfer Payment ---
  router.post('/payments/link-bank', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT email, stripe_customer_id FROM users WHERE id = ${req.userId}`;
      if (!user.stripe_customer_id) {
        res.status(503).json({ error: 'Bank linking requires Stripe Customer setup. Please make a card payment first.' });
        return;
      }
      const result = await createFinancialConnectionsSession(user.stripe_customer_id);
      res.json(result);
    } catch (error) {
      console.error('Bank linking error:', error);
      res.status(500).json({ error: 'Failed to start bank linking' });
    }
  });

  router.get('/payments/bank-accounts', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT stripe_customer_id FROM users WHERE id = ${req.userId}`;
      if (!user?.stripe_customer_id) {
        res.json({ bank_accounts: [] });
        return;
      }
      const accounts = await listBankAccounts(user.stripe_customer_id);
      res.json({ bank_accounts: accounts });
    } catch (error) {
      console.error('Bank accounts error:', error);
      res.status(500).json({ error: 'Failed to load bank accounts' });
    }
  });

  router.delete('/payments/bank-accounts/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      if (!req.params.id || !/^pm_/.test(req.params.id)) {
        res.status(400).json({ error: 'Invalid payment method ID' });
        return;
      }
      const [user] = await sql`SELECT stripe_customer_id FROM users WHERE id = ${req.userId}`;
      if (!user?.stripe_customer_id) {
        res.status(404).json({ error: 'No bank accounts found' });
        return;
      }
      const accounts = await listBankAccounts(user.stripe_customer_id);
      const owns = accounts.some((a) => a.id === req.params.id);
      if (!owns) {
        res.status(404).json({ error: 'Bank account not found' });
        return;
      }
      await detachBankAccount(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error('Bank account deletion error:', error);
      res.status(500).json({ error: 'Failed to remove bank account' });
    }
  });
}
