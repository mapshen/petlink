import Stripe from 'stripe';
import sql from './db.ts';

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
  return new Stripe(key);
}

export async function getOrCreateStripeCustomer(userId: number, email: string): Promise<string> {
  // Use transaction with row-level lock to prevent race condition
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await sql.begin(async (tx: any) => {
    const [user] = await tx`SELECT stripe_customer_id FROM users WHERE id = ${userId} FOR UPDATE`;
    if (user?.stripe_customer_id) return user.stripe_customer_id;

    const stripe = getStripe();
    const customer = await stripe.customers.create({
      email,
      metadata: { petlink_user_id: String(userId) },
    });

    await tx`UPDATE users SET stripe_customer_id = ${customer.id} WHERE id = ${userId}`;
    return customer.id;
  });
  return result;
}
