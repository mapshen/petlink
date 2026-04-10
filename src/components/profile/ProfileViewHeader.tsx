import { Eye, EyeOff } from 'lucide-react';
import type { ProfileType } from '../../types';

interface ProfileViewHeaderProps {
  name: string;
  avatarUrl?: string;
  profileType: ProfileType;
  subtitle?: string;
  isOwner: boolean;
  viewAsVisitor?: boolean;
  onToggleViewMode?: () => void;
  badges?: React.ReactNode;
  stats?: React.ReactNode;
  children?: React.ReactNode;
}

const AVATAR_FALLBACK: Record<ProfileType, string> = {
  sitter: '🐕',
  owner: '👤',
  pet: '🐾',
};

export default function ProfileViewHeader({
  name,
  avatarUrl,
  profileType,
  subtitle,
  isOwner,
  viewAsVisitor = false,
  onToggleViewMode,
  badges,
  stats,
  children,
}: ProfileViewHeaderProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 mb-4 relative group">
      {isOwner && !viewAsVisitor && (
        onToggleViewMode ? (
          <button
            onClick={onToggleViewMode}
            className="absolute top-3 right-3 bg-stone-100 text-stone-700 px-3 py-1.5 rounded-xl text-xs font-medium hover:bg-stone-200 transition-colors flex items-center gap-1.5"
          >
            <Eye className="w-3.5 h-3.5" />
            View as visitor
          </button>
        ) : (
          <div className="absolute top-3 right-3 text-xs text-stone-400 bg-stone-50 px-2 py-1 rounded-full">
            Your profile
          </div>
        )
      )}
      {isOwner && viewAsVisitor && onToggleViewMode && (
        <button
          onClick={onToggleViewMode}
          className="absolute top-3 right-3 bg-stone-100 text-stone-700 px-3 py-1.5 rounded-xl text-xs font-medium hover:bg-stone-200 transition-colors flex items-center gap-1.5"
        >
          <EyeOff className="w-3.5 h-3.5" />
          Back to editing
        </button>
      )}
      <div className="flex gap-5 items-start">
        <div className="w-20 h-20 rounded-full bg-stone-100 flex items-center justify-center text-3xl flex-shrink-0 overflow-hidden">
          {avatarUrl ? (
            <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
          ) : (
            AVATAR_FALLBACK[profileType]
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h1 className="text-xl font-bold text-stone-900">{name}</h1>
            {badges}
          </div>
          {subtitle && (
            <p className="text-sm text-stone-500 mb-2">{subtitle}</p>
          )}
          {stats && (
            <div className="flex gap-4 pt-2 border-t border-stone-100 mt-2">
              {stats}
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
