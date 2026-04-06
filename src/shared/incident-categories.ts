/**
 * Incident category labels — shared between server routes and email templates.
 */

export const INCIDENT_CATEGORY_LABELS: Record<string, string> = {
  pet_injury: 'Pet Injury',
  property_damage: 'Property Damage',
  safety_concern: 'Safety Concern',
  behavioral_issue: 'Behavioral Issue',
  service_issue: 'Service Issue',
  other: 'Other',
};

export function getIncidentCategoryLabel(category: string): string {
  return INCIDENT_CATEGORY_LABELS[category] ?? category;
}
