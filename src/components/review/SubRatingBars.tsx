import type { Review } from '../../types';

interface SubRatingBarsProps {
  reviews: Review[];
}

interface BarData {
  label: string;
  average: number;
}

export default function SubRatingBars({ reviews }: SubRatingBarsProps) {
  const categories: [keyof Review, string][] = [
    ['pet_care_rating', 'Pet Care'],
    ['communication_rating', 'Communication'],
    ['reliability_rating', 'Reliability'],
  ];

  const bars: BarData[] = categories
    .map(([key, label]) => {
      const values = reviews
        .map((r) => r[key] as number | null | undefined)
        .filter((v): v is number => v != null);
      if (values.length === 0) return null;
      const avg = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
      return { label, average: avg };
    })
    .filter(Boolean) as BarData[];

  if (bars.length === 0) return null;

  return (
    <div className="space-y-2">
      {bars.map(({ label, average }) => (
        <div key={label} className="flex items-center gap-3">
          <span className="text-xs text-stone-500 w-24">{label}</span>
          <div className="flex-1 h-1.5 rounded-full bg-stone-200">
            <div
              className="h-1.5 rounded-full bg-emerald-500"
              style={{ width: `${(average / 5) * 100}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-stone-700 w-6 text-right">{average}</span>
        </div>
      ))}
    </div>
  );
}
