import Stripe from 'stripe';

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

function getStripe(): Stripe {
  if (!STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  return new Stripe(STRIPE_SECRET_KEY);
}

export async function createConnectedAccount(email: string): Promise<string> {
  const stripe = getStripe();
  const account = await stripe.accounts.create({
    type: 'express',
    email,
    capabilities: {
      transfers: { requested: true },
    },
  });
  return account.id;
}

export async function createAccountLink(accountId: string, returnUrl: string): Promise<string> {
  const stripe = getStripe();
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${returnUrl}/stripe/refresh`,
    return_url: `${returnUrl}/stripe/return`,
    type: 'account_onboarding',
  });
  return link.url;
}

export async function createPaymentIntent(
  amount: number,
  sitterStripeAccountId: string,
  platformFeePercent: number = 15
): Promise<{ clientSecret: string; paymentIntentId: string }> {
  const stripe = getStripe();
  const platformFee = Math.round(amount * (platformFeePercent / 100));

  const paymentIntent = await stripe.paymentIntents.create({
    amount,
    currency: 'usd',
    application_fee_amount: platformFee,
    transfer_data: {
      destination: sitterStripeAccountId,
    },
    // Hold funds — capture later after service completion (escrow)
    capture_method: 'manual',
  });

  return {
    clientSecret: paymentIntent.client_secret!,
    paymentIntentId: paymentIntent.id,
  };
}

export async function capturePayment(paymentIntentId: string): Promise<void> {
  const stripe = getStripe();
  await stripe.paymentIntents.capture(paymentIntentId);
}

export async function cancelPayment(paymentIntentId: string): Promise<void> {
  const stripe = getStripe();
  await stripe.paymentIntents.cancel(paymentIntentId);
}

export function constructWebhookEvent(body: string | Buffer, signature: string): Stripe.Event {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  }
  return stripe.webhooks.constructEvent(body, signature, webhookSecret);
}
