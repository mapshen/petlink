/** Simple booking price (backwards compatible) */
export function calculateBookingPrice(
  basePrice: number,
  additionalPetPrice: number,
  petCount: number
): number {
  const extraPets = Math.max(0, petCount - 1);
  const total = basePrice + extraPets * additionalPetPrice;
  return Math.round(total * 100) / 100;
}

/**
 * Check if a date falls on a major US holiday (pet sitting premium dates).
 * Uses UTC methods so server/client agree regardless of timezone.
 * Supported holidays: New Year's Day, July 4th, Christmas Eve, Christmas,
 * New Year's Eve, Thanksgiving, Black Friday, Memorial Day, Labor Day.
 */
export function isUSHoliday(date: Date): boolean {
  const month = date.getUTCMonth(); // 0-indexed
  const day = date.getUTCDate();
  const dayOfWeek = date.getUTCDay(); // 0=Sun

  // Fixed-date holidays
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
  // Black Friday: day after Thanksgiving
  if (month === 10 && dayOfWeek === 5) {
    const thursdayDay = day - 1;
    const weekOfMonth = Math.ceil(thursdayDay / 7);
    if (weekOfMonth === 4) return true;
  }

  // Memorial Day: last Monday in May
  if (month === 4 && dayOfWeek === 1 && day > 24) return true;

  // Labor Day: first Monday in September
  if (month === 8 && dayOfWeek === 1 && day <= 7) return true;

  return false;
}

/** Check if a pet is a puppy/kitten (under 1 year old) */
export function isPuppy(age: number | undefined): boolean {
  if (age === undefined) return false;
  return age < 1;
}

export interface PricingOptions {
  basePrice: number;
  additionalPetPrice: number;
  petCount: number;
  isHoliday?: boolean;
  holidayRate?: number;
  hasPuppy?: boolean;
  puppyRate?: number;
  pickupDropoff?: boolean;
  pickupDropoffFee?: number;
  groomingAddon?: boolean;
  groomingAddonFee?: number;
}

export interface PriceBreakdown {
  base: number;
  extraPets: number;
  pickupDropoff: number;
  grooming: number;
  holidayApplied: boolean;
  puppyApplied: boolean;
}

export interface PricingResult {
  total: number;
  breakdown: PriceBreakdown;
}

/** Calculate booking price with holiday rates, puppy rates, and add-ons */
export function calculateAdvancedPrice(options: PricingOptions): PricingResult {
  const {
    basePrice, additionalPetPrice, petCount,
    isHoliday, holidayRate,
    hasPuppy, puppyRate,
    pickupDropoff, pickupDropoffFee,
    groomingAddon, groomingAddonFee,
  } = options;

  // Rate precedence: holiday > puppy > base.
  // Holiday and puppy rates are standalone overrides of the base price, not stackable.
  // Business rationale: sitters set holiday_rate as an all-in premium that already
  // accounts for the extra effort of holiday care, including young pets.
  let effectiveBase = basePrice;
  let holidayApplied = false;
  let puppyApplied = false;

  if (isHoliday && holidayRate != null) {
    effectiveBase = holidayRate;
    holidayApplied = true;
  } else if (hasPuppy && puppyRate != null) {
    effectiveBase = puppyRate;
    puppyApplied = true;
  }

  const extraPets = Math.max(0, petCount - 1) * additionalPetPrice;
  const pickupFee = pickupDropoff && pickupDropoffFee ? pickupDropoffFee : 0;
  const groomFee = groomingAddon && groomingAddonFee ? groomingAddonFee : 0;

  const total = Math.round((effectiveBase + extraPets + pickupFee + groomFee) * 100) / 100;

  return {
    total,
    breakdown: {
      base: effectiveBase,
      extraPets,
      pickupDropoff: pickupFee,
      grooming: groomFee,
      holidayApplied,
      puppyApplied,
    },
  };
}
