import type { Review } from '../../types';

const OWNER_LABELS: [keyof Review, string][] = [
  ['pet_care_rating', '🐾 Care'],
  ['communication_rating', '💬 Comm'],
  ['reliability_rating', '⏰ Reliable'],
];

const SITTER_LABELS: [keyof Review, string][] = [
  ['pet_accuracy_rating', '📋 Accuracy'],
  ['communication_rating', '💬 Comm'],
  ['preparedness_rating', '🏠 Prepared'],
];

function pillColor(rating: number): string {
  if (rating >= 4) return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (rating === 3) return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-red-50 text-red-700 border-red-200';
}

interface SubRatingPillsProps {
  review: Review;
}

export default function SubRatingPills({ review }: SubRatingPillsProps) {
  // Determine which labels to show based on which sub-ratings are present
  const hasOwnerRatings = review.pet_care_rating != null || review.reliability_rating != null;
  const labels = hasOwnerRatings ? OWNER_LABELS : SITTER_LABELS;

  const pills = labels
    .map(([key, label]) => {
      const value = review[key] as number | null | undefined;
      if (value == null) return null;
      return { label, value };
    })
    .filter(Boolean) as { label: string; value: number }[];

  if (pills.length === 0) return null;

  return (
    <div className="flex gap-1.5 flex-wrap">
      {pills.map(({ label, value }) => (
        <span
          key={label}
          className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${pillColor(value)}`}
        >
          {label} {value}
        </span>
      ))}
    </div>
  );
}
