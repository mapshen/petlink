export function calculateBookingPrice(
  basePrice: number,
  additionalPetPrice: number,
  petCount: number
): number {
  const extraPets = Math.max(0, petCount - 1);
  const total = basePrice + extraPets * additionalPetPrice;
  return Math.round(total * 100) / 100;
}
