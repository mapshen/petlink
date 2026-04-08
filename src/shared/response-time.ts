export interface ResponseTimeLabel {
  label: string;
  shortLabel: string;
  color: 'emerald' | 'amber' | 'stone';
}

export function formatResponseTime(hours: number | null | undefined): ResponseTimeLabel | null {
  if (hours == null || hours >= 24) return null;
  if (hours < 1) return { label: 'Responds in < 1 hour', shortLabel: '< 1hr', color: 'emerald' };
  if (hours < 4) return { label: 'Responds in < 4 hours', shortLabel: '< 4hrs', color: 'emerald' };
  return { label: 'Responds in < 24 hours', shortLabel: '< 24hrs', color: 'amber' };
}

export function responseTimeMatchesFilter(hours: number | null | undefined, filterHours: number): boolean {
  if (hours == null) return false;
  return hours <= filterHours;
}
