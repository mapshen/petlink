import { Link } from 'react-router-dom';
import { Import } from 'lucide-react';
import BecomeSitterDialog from '../../components/profile/BecomeSitterDialog';
import type { User } from '../../types';
import type { SectionDef } from './profileSections';

interface Props {
  readonly user: User;
  readonly mode: string;
  readonly isSitter: boolean;
  readonly hasSitterRole: boolean;
  readonly activeSection: string;
  readonly sections: readonly SectionDef[];
}

export default function ProfileSidebar({
  user, mode, isSitter, hasSitterRole, activeSection, sections,
}: Props) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-3 sticky top-20 flex flex-col">
      {/* User Card */}
      <div className="flex items-center gap-3 px-3 py-3 mb-2 border-b border-stone-100">
        <img
          src={user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}`}
          alt={user.name}
          className="w-10 h-10 rounded-full object-cover border border-stone-200"
        />
        <div className="min-w-0">
          <p className="text-sm font-bold text-stone-900 leading-tight">{user.name}</p>
          <p className="text-[10px] text-stone-400 capitalize">
            {mode === 'owner' ? 'Pet Owner' : 'Sitter'}
          </p>
        </div>
      </div>

      <nav aria-label="Profile sections" className="flex md:flex-col gap-0.5 overflow-x-auto md:overflow-x-visible flex-1">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <a
              key={s.id}
              href={`#section-${s.id}`}
              aria-current={activeSection === s.id ? 'true' : undefined}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm whitespace-nowrap transition-colors ${
                activeSection === s.id
                  ? 'bg-emerald-50 text-emerald-700 font-medium'
                  : 'text-stone-500 hover:bg-stone-50 hover:text-stone-900'
              }`}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {s.label}
            </a>
          );
        })}
      </nav>

      {/* Bottom Links */}
      <div className="mt-auto pt-3 border-t border-stone-100 space-y-1">
        {isSitter && (
          <Link
            to="/import-profile"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-blue-600 hover:bg-blue-50 whitespace-nowrap transition-colors"
          >
            <Import className="w-4 h-4 flex-shrink-0" />
            Import from Rover
          </Link>
        )}

        {!hasSitterRole && user.approval_status !== 'pending_approval' && (
          <BecomeSitterDialog onSuccess={() => window.location.reload()} />
        )}

        {!hasSitterRole && user.approval_status === 'pending_approval' && (
          <div className="px-3 py-2 rounded-lg bg-amber-50 text-xs text-amber-700 font-medium">
            Application pending review
          </div>
        )}
      </div>
    </div>
  );
}
