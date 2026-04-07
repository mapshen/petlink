/**
 * Loyalty discount calculation utilities.
 * All monetary values are in INTEGER CENTS.
 */

export interface LoyaltyTier {
  id?: number;
  sitter_id: number;
  min_bookings: number;
  discount_percent: number;
}

/**
 * Find the best matching loyalty tier for a given completed booking count.
 * Returns the tier with the highest min_bookings that the count satisfies.
 */
export function findApplicableTier(
  tiers: LoyaltyTier[],
  completedBookings: number
): LoyaltyTier | null {
  if (tiers.length === 0 || completedBookings <= 0) return null;

  const sorted = [...tiers]
    .filter((t) => completedBookings >= t.min_bookings)
    .sort((a, b) => b.min_bookings - a.min_bookings);

  return sorted[0] ?? null;
}

/**
 * Calculate the discount amount in cents.
 * Returns 0 if no tier applies or discount is 0%.
 */
export function calculateLoyaltyDiscount(
  totalCents: number,
  discountPercent: number
): number {
  if (discountPercent <= 0 || discountPercent > 50) return 0;
  if (totalCents <= 0) return 0;
  return Math.round(totalCents * discountPercent / 100);
}
