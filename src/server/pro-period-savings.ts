import sql from './db.ts';
import { getActiveProPeriod } from './pro-periods.ts';

export interface ProPeriodSavings {
  saved_cents: number;
  booking_count: number;
  period_source: string;
  period_starts_at: string;
}

/**
 * Calculate how much a sitter saved in platform fees during their active pro period.
 * Computes the hypothetical 15% fee on all completed bookings during the period.
 */
export async function getProPeriodSavings(userId: number): Promise<ProPeriodSavings | null> {
  const period = await getActiveProPeriod(userId);
  if (!period) return null;

  const [result] = await sql`
    SELECT
      COALESCE(SUM(ROUND(b.total_price_cents * 0.15)), 0)::int as saved_cents,
      count(*)::int as booking_count
    FROM bookings b
    WHERE b.sitter_id = ${userId}
      AND b.status IN ('completed', 'confirmed', 'in_progress')
      AND b.created_at >= ${period.starts_at}
  `;

  return {
    saved_cents: result.saved_cents,
    booking_count: result.booking_count,
    period_source: period.source,
    period_starts_at: period.starts_at,
  };
}
