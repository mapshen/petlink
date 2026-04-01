import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

function getStripe(): Stripe {
  if (!STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  return new Stripe(STRIPE_SECRET_KEY);
}

export async function createPaymentIntent(
  amount: number
): Promise<{ clientSecret: string; paymentIntentId: string }> {
  const stripe = getStripe();

  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: 'usd',
    // Hold funds — capture later after service completion (escrow)
    capture_method: 'manual',
  });

  if (!paymentIntent.client_secret) {
    throw new Error('Payment intent created without client secret');
  }
  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
  };
}

export async function createACHPaymentIntent(
  amount: number,
  customerId: string
): Promise<{ clientSecret: string; paymentIntentId: string }> {
  const stripe = getStripe();

  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: 'usd',
    customer: customerId,
    payment_method_types: ['us_bank_account'],
    // ACH does not support manual capture — payment processed immediately
    // Escrow safety comes from the delayed payout system
  });

  if (!paymentIntent.client_secret) {
    throw new Error('Payment intent created without client secret');
  }
  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
  };
}

export async function createFinancialConnectionsSession(
  customerId: string
): Promise<{ clientSecret: string }> {
  const stripe = getStripe();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = await (stripe as any).financialConnections.sessions.create({
    account_holder: { type: 'customer', customer: customerId },
    permissions: ['payment_method'],
  });
  return { clientSecret: session.client_secret };
}

export async function listBankAccounts(customerId: string): Promise<{ id: string; bank_name: string; last4: string; status: string }[]> {
  const stripe = getStripe();
  const methods = await stripe.paymentMethods.list({ customer: customerId, type: 'us_bank_account' });
  return methods.data.map((m) => ({
    id: m.id,
    bank_name: m.us_bank_account?.bank_name ?? 'Bank',
    last4: m.us_bank_account?.last4 ?? '****',
    // status is not in the standard Stripe PaymentMethod type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    status: (m.us_bank_account as any)?.status ?? 'unknown',
  }));
}

export async function detachBankAccount(paymentMethodId: string): Promise<void> {
  const stripe = getStripe();
  await stripe.paymentMethods.detach(paymentMethodId);
}

export async function capturePayment(paymentIntentId: string, amountToCapture?: number): Promise<void> {
  if (amountToCapture != null && amountToCapture <= 0) {
    throw new Error('Capture amount must be positive');
  }
  const stripe = getStripe();
  await stripe.paymentIntents.capture(paymentIntentId, amountToCapture != null ? { amount_to_capture: amountToCapture } : undefined);
}

export async function cancelPayment(paymentIntentId: string): Promise<void> {
  const stripe = getStripe();
  await stripe.paymentIntents.cancel(paymentIntentId);
}

export async function refundPayment(paymentIntentId: string, amountCents?: number): Promise<void> {
  const stripe = getStripe();
  await stripe.refunds.create({
    payment_intent: paymentIntentId,
    ...(amountCents !== undefined ? { amount: amountCents } : {}),
  });
}

export function constructWebhookEvent(body: string | Buffer, signature: string): Stripe.Event {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  }
  return stripe.webhooks.constructEvent(body, signature, webhookSecret);
}

// --- Stripe Billing (Subscriptions) ---

const PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID;

export async function createSubscriptionCheckout(
  userId: number,
  email: string,
  returnUrl: string
): Promise<string> {
  const stripe = getStripe();
  if (!PRO_PRICE_ID) {
    throw new Error('STRIPE_PRO_PRICE_ID is not configured');
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer_email: email,
    line_items: [{ price: PRO_PRICE_ID, quantity: 1 }],
    success_url: `${returnUrl}/subscription?success=true`,
    cancel_url: `${returnUrl}/subscription?cancelled=true`,
    metadata: { petlink_user_id: String(userId) },
  });

  return session.url!;
}

export async function createSubscriptionIntent(
  customerId: string,
  priceId: string
): Promise<{ clientSecret: string; subscriptionId: string }> {
  const stripe = getStripe();
  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: [{ price: priceId }],
    payment_behavior: 'default_incomplete',
    payment_settings: { save_default_payment_method: 'on_subscription' },
    expand: ['latest_invoice.payment_intent'],
  });

  const invoice = subscription.latest_invoice;
  if (!invoice || typeof invoice === 'string') {
    throw new Error('Subscription invoice not expanded');
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paymentIntent = (invoice as any).payment_intent as Stripe.PaymentIntent;
  if (!paymentIntent?.client_secret) {
    throw new Error('Subscription payment intent created without client secret');
  }

  return {
    clientSecret: paymentIntent.client_secret,
    subscriptionId: subscription.id,
  };
}

export async function cancelStripeSubscription(stripeSubscriptionId: string): Promise<void> {
  const stripe = getStripe();
  await stripe.subscriptions.cancel(stripeSubscriptionId);
}

export async function listPaymentMethods(customerId: string): Promise<{ id: string; brand: string; last4: string; exp_month: number; exp_year: number }[]> {
  const stripe = getStripe();
  const methods = await stripe.paymentMethods.list({ customer: customerId, type: 'card' });
  return methods.data.map((m) => ({
    id: m.id,
    brand: m.card?.brand ?? 'unknown',
    last4: m.card?.last4 ?? '****',
    exp_month: m.card?.exp_month ?? 0,
    exp_year: m.card?.exp_year ?? 0,
  }));
}

export async function detachPaymentMethod(paymentMethodId: string): Promise<void> {
  const stripe = getStripe();
  await stripe.paymentMethods.detach(paymentMethodId);
}

export async function listCharges(customerId: string, limit: number = 20): Promise<{ id: string; amount: number; status: string; description: string | null; created_at: string; invoice_id?: string }[]> {
  const stripe = getStripe();
  const charges = await stripe.charges.list({ customer: customerId, limit });
  return charges.data.map((c) => ({
    id: c.id,
    amount: c.amount,
    status: c.status,
    description: c.description,
    created_at: new Date(c.created * 1000).toISOString(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    invoice_id: (c as any).invoice ? String((c as any).invoice) : undefined,
  }));
}

export async function getStripeSubscription(stripeSubscriptionId: string): Promise<Stripe.Subscription> {
  const stripe = getStripe();
  return stripe.subscriptions.retrieve(stripeSubscriptionId);
}
