export const SPECIES_ICONS: Record<string, string> = {
  dog: '🐕',
  cat: '🐱',
  bird: '🐦',
  reptile: '🦎',
  small_animal: '🐹',
};

export function formatSpecies(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
