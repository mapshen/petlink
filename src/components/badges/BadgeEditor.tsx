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
import {
  getBadgesByCategory,
  AUTO_BADGE_SLUGS,
  type BadgeDefinition,
} from '../../shared/badge-catalog';

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

interface BadgeEditorProps {
  readonly selectedBadges: string[];
  readonly autoBadges: string[];
  readonly onToggle: (slug: string) => void;
}

function BadgeToggle({
  badge,
  isActive,
  isAuto,
  onToggle,
}: {
  readonly badge: BadgeDefinition;
  readonly isActive: boolean;
  readonly isAuto: boolean;
  readonly onToggle: () => void;
}) {
  const Icon = ICON_MAP[badge.icon];

  return (
    <button
      type="button"
      onClick={isAuto ? undefined : onToggle}
      disabled={isAuto}
      title={isAuto ? `Auto-detected from your profile settings` : badge.description}
      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors border ${
        isActive
          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
          : 'bg-white border-stone-200 text-stone-500 hover:bg-stone-50 hover:border-stone-300'
      } ${isAuto ? 'opacity-75 cursor-default' : 'cursor-pointer'}`}
    >
      {Icon && <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-600' : 'text-stone-400'}`} />}
      <span>{badge.label}</span>
      {isAuto && (
        <span className="text-[10px] bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded-full">
          auto
        </span>
      )}
    </button>
  );
}

export default function BadgeEditor({ selectedBadges, autoBadges, onToggle }: BadgeEditorProps) {
  const groups = getBadgesByCategory();

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.category}>
          <span className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider">
            {group.label}
          </span>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {group.badges.map((badge) => {
              const isAuto = AUTO_BADGE_SLUGS.includes(badge.slug);
              const isActive = isAuto
                ? autoBadges.includes(badge.slug)
                : selectedBadges.includes(badge.slug);

              return (
                <BadgeToggle
                  key={badge.slug}
                  badge={badge}
                  isActive={isActive}
                  isAuto={isAuto}
                  onToggle={() => onToggle(badge.slug)}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
