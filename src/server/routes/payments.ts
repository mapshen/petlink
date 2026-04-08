import type { Router } from 'express';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { validate, paymentIntentSchema, paymentActionSchema } from '../validation.ts';
import { createPaymentIntent, createACHPaymentIntent, capturePayment, cancelPayment, constructWebhookEvent, listPaymentMethods, detachPaymentMethod, listCharges, createFinancialConnectionsSession, listBankAccounts, detachBankAccount, createStripeCustomerBalanceTransaction } from '../payments.ts';
import { calculateApplicationFee } from '../stripe-connect.ts';
import { getPayoutsForSitter, getPendingPayoutsForSitter } from '../payouts.ts';
import { createNotification } from '../notifications.ts';
import { handleAccountUpdated } from '../stripe-connect.ts';
import { getBalance } from '../credits.ts';
import { insertAutoExpense } from '../auto-expenses.ts';
import logger, { sanitizeError } from '../logger.ts';

export default function paymentRoutes(router: Router): void {
  // --- Payments (destination charges via Stripe Connect) ---
  router.post('/payments/create-intent', authMiddleware, validate(paymentIntentSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const { booking_id } = req.body;
      const [booking] = await sql`SELECT id, owner_id, sitter_id, status, payment_intent_id, total_price_cents FROM bookings WHERE id = ${booking_id} AND owner_id = ${req.userId}`;
      if (!booking) {
        res.status(404).json({ error: 'Booking not found' });
        return;
      }
      if (booking.status !== 'confirmed' && booking.status !== 'pending') {
        res.status(400).json({ error: 'Payment can only be created for pending or confirmed bookings' });
        return;
      }
      if (booking.payment_intent_id) {
        res.status(409).json({ error: 'Payment already initiated for this booking' });
        return;
      }
      const amountCents = booking.total_price_cents;
      if (!amountCents || amountCents <= 0) {
        res.status(400).json({ error: 'No payment required for free bookings' });
        return;
      }

      // Look up sitter's Connect account for destination charge
      const [sitter] = await sql`
        SELECT stripe_account_id, stripe_payouts_enabled, stripe_charges_enabled, subscription_tier
        FROM users WHERE id = ${booking.sitter_id}
      `;
      if (!sitter?.stripe_account_id || !sitter.stripe_payouts_enabled || !sitter.stripe_charges_enabled) {
        res.status(400).json({ error: 'Sitter has not completed payout setup' });
        return;
      }

      const applicationFee = calculateApplicationFee(amountCents, sitter.subscription_tier || 'free');
      const { clientSecret, paymentIntentId } = await createPaymentIntent(amountCents, sitter.stripe_account_id, applicationFee);
      await sql`UPDATE bookings SET payment_intent_id = ${paymentIntentId}, payment_status = 'held' WHERE id = ${booking_id}`;
      res.json({ clientSecret });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Payment intent error');
      res.status(500).json({ error: 'Failed to create payment' });
    }
  });

  router.post('/payments/capture', authMiddleware, validate(paymentActionSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const { booking_id } = req.body;
      // Capture restricted to sitter (service provider) on completed bookings
      const [booking] = await sql`
        SELECT * FROM bookings WHERE id = ${booking_id} AND sitter_id = ${req.userId}
          AND payment_status = 'held' AND status = 'completed'
      `;
      if (!booking) {
        res.status(404).json({ error: 'Booking not found, not completed, or payment not held' });
        return;
      }
      await capturePayment(booking.payment_intent_id);
      await sql`UPDATE bookings SET payment_status = 'captured' WHERE id = ${booking_id}`;
      await createNotification(booking.owner_id, 'payment_update', 'Payment Captured', 'Your payment has been processed.', { booking_id });

      // Auto-log platform fee expense for free-tier sitters
      const [captureSitter] = await sql`SELECT subscription_tier FROM users WHERE id = ${req.userId}`;
      const platformFee = calculateApplicationFee(booking.total_price_cents, captureSitter?.subscription_tier || 'free');
      if (platformFee > 0) {
        await insertAutoExpense({
          sitter_id: req.userId!,
          category: 'platform_fee',
          amount_cents: platformFee,
          description: `PetLink platform fee - Booking #${booking_id} (auto-logged)`,
          date: new Date().toISOString().split('T')[0],
          source_reference: `platform_fee:booking:${booking_id}`,
        });
      }

      res.json({ success: true });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Payment capture error');
      res.status(500).json({ error: 'Failed to capture payment' });
    }
  });

  router.post('/payments/cancel', authMiddleware, validate(paymentActionSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const { booking_id } = req.body;
      // Only allow cancel on pending bookings — confirmed/in-progress must go through
      // the booking cancellation flow which enforces cancellation policies
      const [booking] = await sql`
        SELECT * FROM bookings WHERE id = ${booking_id} AND owner_id = ${req.userId}
          AND payment_status = 'held' AND status = 'pending'
      `;
      if (!booking) {
        res.status(404).json({ error: 'Booking not found, not pending, or payment not held' });
        return;
      }
      await cancelPayment(booking.payment_intent_id);
      await sql`UPDATE bookings SET payment_status = 'cancelled', status = 'cancelled' WHERE id = ${booking_id}`;
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Payment cancel error');
      res.status(500).json({ error: 'Failed to cancel payment' });
    }
  });

  // --- Payouts ---
  router.get('/payouts', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
      if (!user.roles.includes('sitter')) {
        res.status(403).json({ error: 'Only sitters can view payouts' });
        return;
      }
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const payouts = await getPayoutsForSitter(req.userId!, limit, offset);
      res.json({ payouts });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Payouts fetch error');
      res.status(500).json({ error: 'Failed to load payouts' });
    }
  });

  router.get('/payouts/pending', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
      if (!user.roles.includes('sitter')) {
        res.status(403).json({ error: 'Only sitters can view payouts' });
        return;
      }
      const payouts = await getPendingPayoutsForSitter(req.userId!);
      res.json({ payouts });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Pending payouts fetch error');
      res.status(500).json({ error: 'Failed to load pending payouts' });
    }
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
          // Only update held payments — don't overwrite already-cancelled bookings
          await sql`UPDATE bookings SET payment_status = 'captured' WHERE payment_intent_id = ${pi.id} AND payment_status = 'held'`;
          const [succeededBooking] = await sql`SELECT id, owner_id, sitter_id, total_price_cents FROM bookings WHERE payment_intent_id = ${pi.id}`;
          if (succeededBooking) {
            await createNotification(succeededBooking.owner_id, 'payment_update', 'Payment Captured', 'Your payment has been processed.', { booking_id: succeededBooking.id });

            // Auto-log platform fee (idempotent — same source_reference as capture endpoint)
            const [whSitter] = await sql`SELECT subscription_tier FROM users WHERE id = ${succeededBooking.sitter_id}`;
            const whFee = calculateApplicationFee(succeededBooking.total_price_cents, whSitter?.subscription_tier || 'free');
            if (whFee > 0) {
              await insertAutoExpense({
                sitter_id: succeededBooking.sitter_id,
                category: 'platform_fee',
                amount_cents: whFee,
                description: `PetLink platform fee - Booking #${succeededBooking.id} (auto-logged)`,
                date: new Date().toISOString().split('T')[0],
                source_reference: `platform_fee:booking:${succeededBooking.id}`,
              });
            }
          }
          break;
        }
        case 'payment_intent.canceled': {
          const pi = event.data.object as { id: string };
          await sql`UPDATE bookings SET payment_status = 'cancelled' WHERE payment_intent_id = ${pi.id} AND payment_status IN ('pending', 'held')`;
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
            metadata: { petlink_user_id?: string; petlink_tier?: string };
          };
          if (session.mode === 'subscription' && session.metadata?.petlink_user_id) {
            const userId = Number(session.metadata.petlink_user_id);
            if (!Number.isInteger(userId) || userId <= 0) {
              logger.warn({ raw: session.metadata.petlink_user_id }, 'Invalid petlink_user_id in checkout metadata');
              break;
            }
            const [subUser] = await sql`SELECT roles FROM users WHERE id = ${userId}`;
            if (!subUser?.roles?.includes('sitter')) {
              logger.warn({ userId }, 'Checkout completed for non-sitter user, skipping');
              break;
            }
            const stripeSubId = session.subscription;
            const tier = session.metadata.petlink_tier === 'premium' ? 'premium' : 'pro';
            const [existing] = await sql`SELECT id FROM sitter_subscriptions WHERE sitter_id = ${userId}`;
            if (existing) {
              await sql.begin(async (tx: any) => {
                await tx`
                  UPDATE sitter_subscriptions SET tier = ${tier}, status = 'active',
                    stripe_subscription_id = ${stripeSubId},
                    current_period_start = NOW(), current_period_end = NOW() + INTERVAL '30 days', updated_at = NOW()
                  WHERE sitter_id = ${userId}
                `;
                await tx`UPDATE users SET subscription_tier = ${tier} WHERE id = ${userId}`;
              });
            } else {
              await sql.begin(async (tx: any) => {
                await tx`
                  INSERT INTO sitter_subscriptions (sitter_id, tier, status, stripe_subscription_id, current_period_start, current_period_end)
                  VALUES (${userId}, ${tier}, 'active', ${stripeSubId}, NOW(), NOW() + INTERVAL '30 days')
                `;
                await tx`UPDATE users SET subscription_tier = ${tier} WHERE id = ${userId}`;
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
        case 'customer.subscription.updated': {
          const sub = event.data.object as { id: string; metadata?: { petlink_tier?: string }; items?: { data: { price: { id: string } }[] } };
          const newTier = sub.metadata?.petlink_tier;
          if (newTier && (newTier === 'pro' || newTier === 'premium')) {
            const [existing] = await sql`SELECT sitter_id FROM sitter_subscriptions WHERE stripe_subscription_id = ${sub.id}`;
            if (existing) {
              await sql.begin(async (tx: any) => {
                await tx`
                  UPDATE sitter_subscriptions SET tier = ${newTier}, status = 'active', updated_at = NOW()
                  WHERE stripe_subscription_id = ${sub.id}
                `;
                await tx`UPDATE users SET subscription_tier = ${newTier} WHERE id = ${existing.sitter_id}`;
              });
            }
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
        case 'invoice.paid': {
          const invoice = event.data.object as unknown as {
            id: string;
            subscription: string;
            amount_paid: number;
            customer: string;
          };
          if (!invoice.subscription || invoice.amount_paid <= 0) break;

          // Idempotency: skip if this event was already processed
          const [alreadyProcessed] = await sql`
            SELECT 1 FROM credit_ledger WHERE stripe_event_id = ${event.id}
          `.catch(() => [] as any[]);
          if (alreadyProcessed) {
            logger.info({ eventId: event.id }, 'invoice.paid already processed, skipping');
            break;
          }

          // Find sitter by subscription
          const [subSitter] = await sql`
            SELECT ss.sitter_id, u.email, u.name, u.stripe_customer_id
            FROM sitter_subscriptions ss
            JOIN users u ON u.id = ss.sitter_id
            WHERE ss.stripe_subscription_id = ${invoice.subscription}
          `.catch(() => [] as any[]);
          if (!subSitter) break;

          // Update subscription period and clear past_due
          await sql`
            UPDATE sitter_subscriptions
            SET status = 'active',
                current_period_start = NOW(),
                current_period_end = NOW() + INTERVAL '30 days',
                updated_at = NOW()
            WHERE stripe_subscription_id = ${invoice.subscription}
          `.catch(() => {});

          // Auto-apply credits to next invoice if balance > 0
          try {
            const balance = await getBalance(subSitter.sitter_id);
            if (balance > 0) {
              const applyAmount = Math.min(balance, invoice.amount_paid);

              // Atomic: deduct credits with stripe_event_id for idempotency
              const [inserted] = await sql`
                INSERT INTO credit_ledger (user_id, amount_cents, type, source_type, description, stripe_event_id)
                VALUES (${subSitter.sitter_id}, ${-applyAmount}, 'redemption', 'subscription',
                        ${'Applied to subscription renewal (invoice ' + invoice.id + ')'}, ${event.id})
                ON CONFLICT (stripe_event_id) WHERE stripe_event_id IS NOT NULL DO NOTHING
                RETURNING id
              `;

              // Only apply Stripe balance if the INSERT actually happened (not a duplicate)
              if (inserted && subSitter.stripe_customer_id) {
                await createStripeCustomerBalanceTransaction(
                  subSitter.stripe_customer_id,
                  -applyAmount,
                  `PetLink credit applied (invoice ${invoice.id})`
                ).catch((err: unknown) => {
                  logger.warn({ err: sanitizeError(err), sitterId: subSitter.sitter_id }, 'Failed to apply Stripe customer balance');
                });
              }

              logger.info({ sitterId: subSitter.sitter_id, appliedCents: applyAmount, invoiceId: invoice.id }, 'Credits auto-applied to subscription renewal');
            }
          } catch (err) {
            logger.warn({ err: sanitizeError(err), sitterId: subSitter.sitter_id }, 'Failed to auto-apply credits at renewal');
          }

          // Auto-log subscription expense for tax tracking
          {
            const [subRecord] = await sql`SELECT tier FROM sitter_subscriptions WHERE stripe_subscription_id = ${invoice.subscription}`.catch(() => [] as any[]);
            const tierName = subRecord?.tier === 'premium' ? 'Premium' : 'Pro';
            const invoiceCreated = (invoice as unknown as { created?: number }).created;
            const expenseDate = invoiceCreated
              ? new Date(invoiceCreated * 1000).toISOString().split('T')[0]
              : new Date().toISOString().split('T')[0];
            await insertAutoExpense({
              sitter_id: subSitter.sitter_id,
              category: 'platform_subscription',
              amount_cents: invoice.amount_paid,
              description: `PetLink ${tierName} subscription (auto-logged)`,
              date: expenseDate,
              source_reference: `invoice:${invoice.id}`,
            });
          }
          break;
        }
        case 'account.updated': {
          const account = event.data.object as {
            id: string;
            charges_enabled?: boolean;
            payouts_enabled?: boolean;
            requirements?: { currently_due?: string[]; disabled_reason?: string | null };
          };
          await handleAccountUpdated(account);
          break;
        }
        case 'transfer.created': {
          // Per-booking transfer to sitter's connected account
          const transfer = event.data.object as { id: string; amount: number; destination: string; metadata?: Record<string, string> };
          const [sitter] = await sql`SELECT id FROM users WHERE stripe_account_id = ${transfer.destination}`;
          if (sitter) {
            // Match by sitter + amount + pending status (LIMIT 1 for oldest first)
            await sql`
              UPDATE sitter_payouts SET status = 'completed', processed_at = NOW(), stripe_transfer_id = ${transfer.id}
              WHERE id = (
                SELECT id FROM sitter_payouts
                WHERE sitter_id = ${sitter.id} AND status = 'pending' AND amount_cents = ${transfer.amount}
                ORDER BY created_at ASC LIMIT 1
              )
            `;
          }
          break;
        }
        case 'payout.failed': {
          // Bank-level payout failure — notify sitter to update banking info
          const payout = event.data.object as { id: string; failure_message?: string };
          const connectedAccountId = (event as unknown as { account?: string }).account;
          if (connectedAccountId) {
            const [user] = await sql`SELECT id FROM users WHERE stripe_account_id = ${connectedAccountId}`;
            if (user) {
              logger.warn({ sitterId: user.id, payoutId: payout.id }, 'Sitter bank payout failed');
              await createNotification(
                user.id, 'payment_update', 'Payout Failed',
                `Your payout could not be processed. ${payout.failure_message || 'Please update your banking information.'}`,
                {}
              );
            }
          }
          break;
        }
      }
      res.json({ received: true });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Stripe webhook error');
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
      logger.error({ err: sanitizeError(error) }, 'Payment methods error');
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
      logger.error({ err: sanitizeError(error) }, 'Delete payment method error');
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
      logger.error({ err: sanitizeError(error) }, 'Payment history error');
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
      logger.error({ err: sanitizeError(error) }, 'Bank linking error');
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
      logger.error({ err: sanitizeError(error) }, 'Bank accounts error');
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
      logger.error({ err: sanitizeError(error) }, 'Bank account deletion error');
      res.status(500).json({ error: 'Failed to remove bank account' });
    }
  });
}
