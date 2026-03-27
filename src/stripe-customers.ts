import Stripe from 'stripe';
import sql from './db.ts';

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
  return new Stripe(key);
}

export async function getOrCreateStripeCustomer(userId: number, email: string): Promise<string> {
  const [user] = await sql`SELECT stripe_customer_id FROM users WHERE id = ${userId}`;
  if (user?.stripe_customer_id) return user.stripe_customer_id;

  const stripe = getStripe();
  const customer = await stripe.customers.create({
    email,
    metadata: { petlink_user_id: String(userId) },
  });

  await sql`UPDATE users SET stripe_customer_id = ${customer.id} WHERE id = ${userId}`;
  return customer.id;
}
