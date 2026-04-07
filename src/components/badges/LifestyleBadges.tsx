import {
  Fence,
  CigaretteOff,
  Baby,
  PawPrint,
  DoorOpen,
  UserCheck,
  HeartPulse,
  Shield,
  GraduationCap,
  Cat,
  Scissors,
  Pill,
  Heart,
  Accessibility,
  type LucideIcon,
} from 'lucide-react';
import { getBadgeBySlug, type BadgeDefinition } from '../../shared/badge-catalog';

const ICON_MAP: Record<string, LucideIcon> = {
  Fence,
  CigaretteOff,
  Baby,
  PawPrint,
  DoorOpen,
  UserCheck,
  HeartPulse,
  Shield,
  GraduationCap,
  Cat,
  Scissors,
  Pill,
  Heart,
  Accessibility,
};

const CATEGORY_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  home_environment: { bg: 'bg-sky-50', text: 'text-sky-800', icon: 'text-sky-600' },
  certifications: { bg: 'bg-amber-50', text: 'text-amber-800', icon: 'text-amber-600' },
  experience: { bg: 'bg-violet-50', text: 'text-violet-800', icon: 'text-violet-600' },
};

interface LifestyleBadgesProps {
  readonly badges: string[];
  readonly size?: 'sm' | 'md';
  readonly maxVisible?: number;
}

function BadgePill({ badge, size }: { readonly badge: BadgeDefinition; readonly size: 'sm' | 'md' }) {
  const Icon = ICON_MAP[badge.icon];
  const colors = CATEGORY_COLORS[badge.category] ?? CATEGORY_COLORS.experience;

  const sizeClasses = size === 'md'
    ? 'text-xs px-2.5 py-1 gap-1.5'
    : 'text-[10px] px-2 py-0.5 gap-1';
  const iconSize = size === 'md' ? 'w-3.5 h-3.5' : 'w-3 h-3';

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full ${colors.bg} ${colors.text} ${sizeClasses}`}
      title={badge.description}
    >
      {Icon && <Icon className={`${iconSize} ${colors.icon}`} />}
      {badge.label}
    </span>
  );
}

export default function LifestyleBadges({ badges, size = 'sm', maxVisible }: LifestyleBadgesProps) {
  if (!badges || badges.length === 0) return null;

  const resolved = badges
    .map(getBadgeBySlug)
    .filter((b): b is BadgeDefinition => b != null);

  if (resolved.length === 0) return null;

  const visible = maxVisible != null ? resolved.slice(0, maxVisible) : resolved;
  const remaining = maxVisible != null ? resolved.length - maxVisible : 0;

  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((badge) => (
        <BadgePill key={badge.slug} badge={badge} size={size} />
      ))}
      {remaining > 0 && (
        <span className="bg-stone-100 text-stone-500 text-[10px] font-medium px-2 py-0.5 rounded-full">
          +{remaining} more
        </span>
      )}
    </div>
  );
}
