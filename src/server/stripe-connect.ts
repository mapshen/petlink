import { getStripe } from './payments.ts';
import sql from './db.ts';
import logger from './logger.ts';

export type ConnectStatus = 'not_started' | 'onboarding' | 'active' | 'restricted' | 'disabled';

export interface ConnectAccountInfo {
  stripe_account_id: string | null;
  stripe_connect_status: ConnectStatus;
  stripe_payouts_enabled: boolean;
  stripe_charges_enabled: boolean;
}

/**
 * Create a Stripe Connect Express account for a sitter.
 * Stores the account ID and sets status to 'onboarding'.
 */
export async function createConnectAccount(
  userId: number,
  email: string
): Promise<{ stripeAccountId: string }> {
  const stripe = getStripe();

  const account = await stripe.accounts.create({
    type: 'express',
    email,
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    metadata: { petlink_user_id: String(userId) },
  });

  // Atomic write — only succeeds if no account was set between the caller's check and now
  const [updated] = await sql`
    UPDATE users
    SET stripe_account_id = ${account.id},
        stripe_connect_status = 'onboarding',
        stripe_payouts_enabled = FALSE,
        stripe_charges_enabled = FALSE
    WHERE id = ${userId} AND stripe_account_id IS NULL
    RETURNING id
  `;
  if (!updated) {
    // Race condition: another request won — clean up the orphaned Stripe account
    await stripe.accounts.del(account.id);
    throw new Error('Connect account already exists');
  }

  return { stripeAccountId: account.id };
}

/**
 * Generate an Account Link URL for Stripe Express onboarding or updates.
 * Links are single-use and expire quickly — generate fresh each time.
 */
export async function createAccountLink(
  stripeAccountId: string,
  returnUrl: string,
  refreshUrl: string,
  type: 'account_onboarding' | 'account_update' = 'account_onboarding'
): Promise<{ url: string; expiresAt: number }> {
  const stripe = getStripe();

  const link = await stripe.accountLinks.create({
    account: stripeAccountId,
    type,
    return_url: returnUrl,
    refresh_url: refreshUrl,
  });

  return { url: link.url, expiresAt: link.expires_at };
}

/**
 * Determine connect status from Stripe account flags.
 */
function determineConnectStatus(
  chargesEnabled: boolean,
  payoutsEnabled: boolean,
  hasRequirements: boolean,
  disabledReason: string | null | undefined
): ConnectStatus {
  if (chargesEnabled && payoutsEnabled) return 'active';
  if (disabledReason) return 'disabled';
  if (hasRequirements && (chargesEnabled || payoutsEnabled)) return 'restricted';
  return 'onboarding';
}

/**
 * Sync connect status to the database and return the info.
 */
async function syncStatusToDb(
  stripeAccountId: string,
  chargesEnabled: boolean,
  payoutsEnabled: boolean,
  status: ConnectStatus
): Promise<ConnectAccountInfo> {
  await sql`
    UPDATE users
    SET stripe_connect_status = ${status},
        stripe_payouts_enabled = ${payoutsEnabled},
        stripe_charges_enabled = ${chargesEnabled}
    WHERE stripe_account_id = ${stripeAccountId}
  `;

  return {
    stripe_account_id: stripeAccountId,
    stripe_connect_status: status,
    stripe_payouts_enabled: payoutsEnabled,
    stripe_charges_enabled: chargesEnabled,
  };
}

/**
 * Retrieve the current status of a connected account from Stripe
 * and sync it to the database.
 */
export async function syncConnectAccountStatus(
  stripeAccountId: string
): Promise<ConnectAccountInfo> {
  const stripe = getStripe();
  const account = await stripe.accounts.retrieve(stripeAccountId);

  const chargesEnabled = account.charges_enabled ?? false;
  const payoutsEnabled = account.payouts_enabled ?? false;
  const hasRequirements = (account.requirements?.currently_due?.length ?? 0) > 0;
  const disabledReason = account.requirements?.disabled_reason;
  const status = determineConnectStatus(chargesEnabled, payoutsEnabled, hasRequirements, disabledReason);

  return syncStatusToDb(stripeAccountId, chargesEnabled, payoutsEnabled, status);
}

/**
 * Handle account.updated webhook — sync status from Stripe event data.
 */
export async function handleAccountUpdated(
  account: {
    id: string;
    charges_enabled?: boolean;
    payouts_enabled?: boolean;
    requirements?: { currently_due?: string[]; disabled_reason?: string | null };
  }
): Promise<ConnectAccountInfo> {
  const chargesEnabled = account.charges_enabled ?? false;
  const payoutsEnabled = account.payouts_enabled ?? false;
  const hasRequirements = (account.requirements?.currently_due?.length ?? 0) > 0;
  const disabledReason = account.requirements?.disabled_reason;
  const status = determineConnectStatus(chargesEnabled, payoutsEnabled, hasRequirements, disabledReason);

  logger.info({ stripeAccountId: account.id, status, chargesEnabled, payoutsEnabled }, 'Connect account status synced');

  return syncStatusToDb(account.id, chargesEnabled, payoutsEnabled, status);
}

/**
 * Update the payout schedule for a connected account.
 */
export async function updatePayoutSchedule(
  stripeAccountId: string,
  delayDays: number
): Promise<void> {
  const stripe = getStripe();
  await stripe.accounts.update(stripeAccountId, {
    settings: {
      payouts: {
        schedule: {
          delay_days: delayDays,
          interval: 'daily',
        },
      },
    },
  });
}

/**
 * Calculate the platform application fee for a booking.
 * Free tier: 15%, Pro/Premium: 0%.
 */
export function calculateApplicationFee(
  amountCents: number,
  subscriptionTier: string
): number {
  if (subscriptionTier === 'pro' || subscriptionTier === 'premium') {
    return 0;
  }
  return Math.round(amountCents * 0.15);
}

/**
 * Get a sitter's connect account info from the database.
 */
export async function getConnectInfo(userId: number): Promise<ConnectAccountInfo> {
  const [user] = await sql`
    SELECT stripe_account_id, stripe_connect_status, stripe_payouts_enabled, stripe_charges_enabled
    FROM users WHERE id = ${userId}
  `;
  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }
  return {
    stripe_account_id: user.stripe_account_id ?? null,
    stripe_connect_status: (user.stripe_connect_status as ConnectStatus) ?? 'not_started',
    stripe_payouts_enabled: user.stripe_payouts_enabled ?? false,
    stripe_charges_enabled: user.stripe_charges_enabled ?? false,
  };
}
