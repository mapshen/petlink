/**
 * Convert a full name to a privacy-safe display name.
 * "Michael Henderson" → "Michael H."
 * "Michael & Sarah Henderson" → "Michael & Sarah H."
 * Used on search results, public profiles, map popups.
 * Full name revealed only after booking is confirmed.
 */
export function getDisplayName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return '';

  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0];

  const lastName = parts[parts.length - 1];

  // For couples ("Michael & Sarah Henderson"), keep both first names
  const ampersandIdx = parts.findIndex((p) => p === '&' || p.toLowerCase() === 'and');
  if (ampersandIdx > 0 && ampersandIdx < parts.length - 1) {
    // Everything before last name, preserving "Michael & Sarah"
    const firstParts = parts.slice(0, -1).join(' ');
    return `${firstParts} ${lastName[0].toUpperCase()}.`;
  }

  // Standard: first name + last initial only (drop middle names)
  return `${parts[0]} ${lastName[0].toUpperCase()}.`;
}
