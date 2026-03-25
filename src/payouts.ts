import sql from './db.ts';
import type { SitterPayout } from './types.ts';

const STANDARD_DELAY_DAYS = 3;
const PRO_DELAY_DAYS = 1;

export async function getPayoutDelay(sitterId: number): Promise<number> {
  const [user] = await sql`SELECT is_pro FROM users WHERE id = ${sitterId}`;
  if (!user) {
    throw new Error(`Sitter not found: ${sitterId}`);
  }
  return user.is_pro ? PRO_DELAY_DAYS : STANDARD_DELAY_DAYS;
}

export async function schedulePayoutForBooking(
  bookingId: number,
  sitterId: number,
  amount: number,
  delayDays: number
): Promise<SitterPayout> {
  const scheduledAt = new Date();
  scheduledAt.setDate(scheduledAt.getDate() + delayDays);

  const [payout] = await sql`
    INSERT INTO sitter_payouts (booking_id, sitter_id, amount, status, scheduled_at)
    VALUES (${bookingId}, ${sitterId}, ${amount}, 'pending', ${scheduledAt.toISOString()})
    RETURNING *
  `;
  return payout as unknown as SitterPayout;
}

export async function getPendingPayouts(): Promise<SitterPayout[]> {
  const payouts = await sql`
    SELECT * FROM sitter_payouts
    WHERE scheduled_at <= NOW() AND status = 'pending'
    ORDER BY scheduled_at ASC
  `;
  return payouts as unknown as SitterPayout[];
}

export async function getPayoutsForSitter(sitterId: number): Promise<SitterPayout[]> {
  const payouts = await sql`
    SELECT * FROM sitter_payouts
    WHERE sitter_id = ${sitterId}
    ORDER BY created_at DESC
  `;
  return payouts as unknown as SitterPayout[];
}

export async function getPendingPayoutsForSitter(sitterId: number): Promise<SitterPayout[]> {
  const payouts = await sql`
    SELECT * FROM sitter_payouts
    WHERE sitter_id = ${sitterId} AND status = 'pending'
    ORDER BY scheduled_at ASC
  `;
  return payouts as unknown as SitterPayout[];
}
