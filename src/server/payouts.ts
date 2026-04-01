import { addDays } from 'date-fns';
import sql from './db.ts';
import type { SitterPayout } from '../types.ts';

const STANDARD_DELAY_DAYS = 3;
const PRO_DELAY_DAYS = 1;

export async function getPayoutDelay(sitterId: number): Promise<number> {
  const [user] = await sql`SELECT is_pro, roles FROM users WHERE id = ${sitterId}`;
  if (!user) {
    throw new Error(`Sitter not found: ${sitterId}`);
  }
  if (!user.roles.includes('sitter')) {
    throw new Error(`User ${sitterId} is not a sitter`);
  }
  return user.is_pro ? PRO_DELAY_DAYS : STANDARD_DELAY_DAYS;
}

export async function schedulePayoutForBooking(
  bookingId: number,
  sitterId: number,
  amountCents: number,
  delayDays: number
): Promise<SitterPayout> {
  const scheduledAt = addDays(new Date(), delayDays);

  const [payout] = await sql`
    INSERT INTO sitter_payouts (booking_id, sitter_id, amount_cents, status, scheduled_at)
    VALUES (${bookingId}, ${sitterId}, ${amountCents}, 'pending', ${scheduledAt.toISOString()})
    ON CONFLICT (booking_id) DO NOTHING
    RETURNING *
  `;
  if (!payout) {
    throw new Error(`Payout already exists for booking ${bookingId}`);
  }
  return payout as unknown as SitterPayout;
}

export async function getPendingPayouts(): Promise<SitterPayout[]> {
  const payouts = await sql`
    SELECT id, booking_id, sitter_id, amount_cents, status, scheduled_at, processed_at, created_at
    FROM sitter_payouts
    WHERE scheduled_at <= NOW() AND status = 'pending'
    ORDER BY scheduled_at ASC
  `;
  return payouts as unknown as SitterPayout[];
}

export async function getPayoutsForSitter(
  sitterId: number,
  limit = 50,
  offset = 0
): Promise<SitterPayout[]> {
  const payouts = await sql`
    SELECT id, booking_id, sitter_id, amount_cents, status, scheduled_at, processed_at, created_at
    FROM sitter_payouts
    WHERE sitter_id = ${sitterId}
    ORDER BY created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
  return payouts as unknown as SitterPayout[];
}

export async function getPendingPayoutsForSitter(sitterId: number): Promise<SitterPayout[]> {
  const payouts = await sql`
    SELECT id, booking_id, sitter_id, amount_cents, status, scheduled_at, processed_at, created_at
    FROM sitter_payouts
    WHERE sitter_id = ${sitterId} AND status = 'pending'
    ORDER BY scheduled_at ASC
  `;
  return payouts as unknown as SitterPayout[];
}
