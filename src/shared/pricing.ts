/**
 * All monetary values in this module are in INTEGER CENTS.
 * e.g., $25.50 = 2550 cents
 */

/** Simple booking price in cents */
export function calculateBookingPrice(
  basePriceCents: number,
  additionalPetPriceCents: number,
  petCount: number
): number {
  const extraPets = Math.max(0, petCount - 1);
  return basePriceCents + extraPets * additionalPetPriceCents;
}

/**
 * Check if a date falls on a major US holiday (pet sitting premium dates).
 * Uses UTC methods so server/client agree regardless of timezone.
 */
export function isUSHoliday(date: Date): boolean {
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const dayOfWeek = date.getUTCDay();

  if (month === 0 && day === 1) return true;   // New Year's Day
  if (month === 6 && day === 4) return true;   // July 4th
  if (month === 11 && day === 25) return true;  // Christmas
  if (month === 11 && day === 24) return true;  // Christmas Eve
  if (month === 11 && day === 31) return true;  // New Year's Eve

  // Thanksgiving: 4th Thursday in November
  if (month === 10 && dayOfWeek === 4) {
    const weekOfMonth = Math.ceil(day / 7);
    if (weekOfMonth === 4) return true;
  }
  // Black Friday
  if (month === 10 && dayOfWeek === 5) {
    const thursdayDay = day - 1;
    const weekOfMonth = Math.ceil(thursdayDay / 7);
    if (weekOfMonth === 4) return true;
  }

  if (month === 4 && dayOfWeek === 1 && day > 24) return true;  // Memorial Day
  if (month === 8 && dayOfWeek === 1 && day <= 7) return true;  // Labor Day

  return false;
}

/** Check if a pet is a puppy/kitten (under 1 year old) */
export function isPuppy(age: number | undefined): boolean {
  if (age === undefined) return false;
  return age < 1;
}

/** All amounts in integer cents */
export interface PricingOptions {
  basePriceCents: number;
  additionalPetPriceCents: number;
  petCount: number;
  isHoliday?: boolean;
  holidayRateCents?: number;
  hasPuppy?: boolean;
  puppyRateCents?: number;
  pickupDropoff?: boolean;
  pickupDropoffFeeCents?: number;
  groomingAddon?: boolean;
  groomingAddonFeeCents?: number;
  addons?: { slug: string; priceCents: number }[];
}

/** All amounts in integer cents */
export interface PriceBreakdown {
  baseCents: number;
  extraPetsCents: number;
  pickupDropoffCents: number;
  groomingCents: number;
  addonsCents: number;
  addonDetails: { slug: string; priceCents: number }[];
  holidayApplied: boolean;
  puppyApplied: boolean;
}

export interface PricingResult {
  totalCents: number;
  breakdown: PriceBreakdown;
}

/** Calculate booking price with holiday rates, puppy rates, and add-ons. All amounts in cents. */
export function calculateAdvancedPrice(options: PricingOptions): PricingResult {
  const {
    basePriceCents, additionalPetPriceCents, petCount,
    isHoliday, holidayRateCents,
    hasPuppy, puppyRateCents,
    pickupDropoff, pickupDropoffFeeCents,
    groomingAddon, groomingAddonFeeCents,
    addons,
  } = options;

  // Rate precedence: holiday > puppy > base.
  // Holiday and puppy rates are standalone overrides, not stackable.
  let effectiveBaseCents = basePriceCents;
  let holidayApplied = false;
  let puppyApplied = false;

  if (isHoliday && holidayRateCents != null) {
    effectiveBaseCents = holidayRateCents;
    holidayApplied = true;
  } else if (hasPuppy && puppyRateCents != null) {
    effectiveBaseCents = puppyRateCents;
    puppyApplied = true;
  }

  const extraPetsCents = Math.max(0, petCount - 1) * additionalPetPriceCents;
  const pickupCents = pickupDropoff && pickupDropoffFeeCents ? pickupDropoffFeeCents : 0;
  const groomCents = groomingAddon && groomingAddonFeeCents ? groomingAddonFeeCents : 0;

  const addonDetails = addons ?? [];
  const addonsCents = addonDetails.reduce((sum, a) => sum + a.priceCents, 0);

  const totalCents = effectiveBaseCents + extraPetsCents + pickupCents + groomCents + addonsCents;

  return {
    totalCents,
    breakdown: {
      baseCents: effectiveBaseCents,
      extraPetsCents,
      pickupDropoffCents: pickupCents,
      groomingCents: groomCents,
      addonsCents,
      addonDetails,
      holidayApplied,
      puppyApplied,
    },
  };
}
