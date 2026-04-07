import { Star } from 'lucide-react';

interface FoundingSitterBadgeProps {
  size?: 'sm' | 'md';
}

export function FoundingSitterBadge({ size = 'sm' }: FoundingSitterBadgeProps) {
  const sizeClasses = size === 'md'
    ? 'text-xs px-2.5 py-0.5 gap-1'
    : 'text-[11px] px-2 py-0.5 gap-0.5';

  const iconSize = size === 'md' ? 'w-3 h-3' : 'w-2.5 h-2.5';

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full bg-gradient-to-r from-emerald-50 to-amber-50 text-emerald-800 border border-emerald-200/50 ${sizeClasses}`}
      title="One of PetLink's original sitters — trusted since Day 1"
    >
      <Star className={`${iconSize} text-amber-500 fill-amber-400`} />
      Founding Sitter
    </span>
  );
}
