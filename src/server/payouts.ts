import sql from './db.ts';
import type { SitterPayout } from '../types.ts';

/**
 * Record a payout tracking entry for a completed booking.
 * With Stripe Connect, actual payout delivery is handled by Stripe —
 * this table serves as a read model populated by the transfer.created webhook.
 */
export async function recordPayoutForBooking(
  bookingId: number,
  sitterId: number,
  amountCents: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx?: any
): Promise<SitterPayout> {
  const db = tx || sql;
  const [payout] = await db`
    INSERT INTO sitter_payouts (booking_id, sitter_id, amount_cents, status, scheduled_at)
    VALUES (${bookingId}, ${sitterId}, ${amountCents}, 'pending', NOW())
    ON CONFLICT (booking_id) DO NOTHING
    RETURNING *
  `;
  if (!payout) {
    throw new Error(`Payout already exists for booking ${bookingId}`);
  }
  return payout as unknown as SitterPayout;
}

export async function getPayoutsForSitter(
  sitterId: number,
  limit = 50,
  offset = 0
): Promise<SitterPayout[]> {
  const payouts = await sql`
    SELECT id, booking_id, sitter_id, amount_cents, status, scheduled_at, processed_at, stripe_transfer_id, created_at
    FROM sitter_payouts
    WHERE sitter_id = ${sitterId}
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  return payouts as unknown as SitterPayout[];
}

export async function getPendingPayoutsForSitter(sitterId: number): Promise<SitterPayout[]> {
  const payouts = await sql`
    SELECT id, booking_id, sitter_id, amount_cents, status, scheduled_at, processed_at, stripe_transfer_id, created_at
    FROM sitter_payouts
    WHERE sitter_id = ${sitterId} AND status = 'pending'
    ORDER BY scheduled_at ASC
  `;
  return payouts as unknown as SitterPayout[];
}
