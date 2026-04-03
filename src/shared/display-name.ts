/**
 * Convert a full name to a privacy-safe display name.
 * "Michael Henderson" → "Michael H."
 * "Michael & Sarah Henderson" → "Michael & Sarah H."
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
    const firstParts = parts.slice(0, -1).join(' ');
    return `${firstParts} ${[...lastName][0].toUpperCase()}.`;
  }

  // Standard: first name + last initial only (drop middle names)
  return `${parts[0]} ${[...lastName][0].toUpperCase()}.`;
}

/**
 * Build a combined name from primary sitter + profile members.
 * "Michael Henderson" + [{name: "Sarah"}] → "Michael & Sarah Henderson"
 */
export function buildCombinedName(primaryName: string, members: { name: string }[]): string {
  if (!members.length) return primaryName;

  const primaryParts = primaryName.trim().split(/\s+/);
  const memberFirstName = members[0].name.trim().split(/\s+/)[0];

  if (primaryParts.length === 1) {
    return `${primaryParts[0]} & ${memberFirstName}`;
  }

  const primaryFirst = primaryParts[0];
  const lastName = primaryParts[primaryParts.length - 1];
  return `${primaryFirst} & ${memberFirstName} ${lastName}`;
}
