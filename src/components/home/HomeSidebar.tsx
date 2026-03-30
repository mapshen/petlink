import { Link } from 'react-router-dom';
import { Search, PawPrint, MessageSquare, Calendar, BarChart3, Megaphone, Wallet } from 'lucide-react';
import OnboardingChecklist from '../onboarding/OnboardingChecklist';
import type { OnboardingStatus } from '../../hooks/useOnboardingStatus';
import type { FavoriteSitter } from '../../types';

interface CareProgress {
  petName: string;
  completed: number;
  total: number;
}

interface Props {
  readonly isSitter: boolean;
  readonly favorites: FavoriteSitter[];
  readonly onboarding: OnboardingStatus;
  readonly checklistDismissed: boolean;
  readonly onDismissChecklist: () => void;
  readonly careProgress: CareProgress[];
}

function QuickActionLink({ to, icon, label }: { readonly to: string; readonly icon: React.ReactNode; readonly label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-stone-50 text-sm font-medium text-stone-700 hover:bg-stone-100 transition-colors"
    >
      {icon}
      {label}
    </Link>
  );
}

function CareProgressCard({ progress }: { readonly progress: CareProgress[] }) {
  if (progress.length === 0) return null;
  return (
    <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-100">
        <h3 className="font-bold text-sm">Today's Care</h3>
      </div>
      <div className="px-4 py-3 space-y-3">
        {progress.map((p) => (
          <div key={p.petName}>
            <div className="flex justify-between items-center mb-1">
              <span className="text-sm font-semibold">{p.petName}</span>
              <span className={`text-xs font-semibold ${p.completed === p.total ? 'text-emerald-600' : 'text-amber-500'}`}>
                {p.completed}/{p.total} done
              </span>
            </div>
            <div
              className="h-1 bg-stone-100 rounded-full"
              role="progressbar"
              aria-valuenow={p.completed}
              aria-valuemax={p.total}
              aria-label={`${p.petName} care progress`}
            >
              <div
                className={`h-1 rounded-full transition-all ${p.completed === p.total ? 'bg-emerald-500' : 'bg-amber-400'}`}
                style={{ width: p.total > 0 ? `${(p.completed / p.total) * 100}%` : '0%' }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HomeSidebar({ isSitter, favorites, onboarding, checklistDismissed, onDismissChecklist, careProgress }: Props) {
  return (
    <div className="flex flex-col gap-3">
      {/* Owner: Favorite Sitters */}
      {!isSitter && favorites.length > 0 && (
        <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-stone-100 flex justify-between items-center">
            <h3 className="font-bold text-sm">Favorite Sitters</h3>
            <Link to="/search" className="text-xs text-emerald-600 font-semibold">See all</Link>
          </div>
          <div className="px-4 py-3 space-y-2.5">
            {favorites.slice(0, 5).map((f) => (
              <Link key={f.sitter_id} to={`/sitter/${f.sitter_id}`} className="flex gap-2.5 items-center hover:opacity-80 transition-opacity">
                <img
                  src={f.sitter_avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(f.sitter_name)}&size=32`}
                  alt={f.sitter_name}
                  className="w-8 h-8 rounded-full border border-stone-200 object-cover"
                />
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{f.sitter_name}</div>
                  {f.sitter_bio && <div className="text-xs text-stone-500 truncate">{f.sitter_bio}</div>}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Sitter: Onboarding Checklist */}
      {isSitter && !onboarding.loading && !onboarding.isComplete && !checklistDismissed && (
        <OnboardingChecklist status={onboarding} onDismiss={onDismissChecklist} />
      )}

      {/* Quick Actions */}
      <div className="bg-white rounded-2xl border border-stone-100 p-4">
        <h3 className="font-bold text-sm mb-3">Quick Actions</h3>
        <div className="flex flex-col gap-2">
          {!isSitter ? (
            <>
              <QuickActionLink to="/search" icon={<Search className="w-4 h-4" />} label="Find a sitter" />
              <QuickActionLink to="/profile#section-pets" icon={<PawPrint className="w-4 h-4" />} label="My pets" />
              <QuickActionLink to="/messages" icon={<MessageSquare className="w-4 h-4" />} label="Messages" />
            </>
          ) : (
            <>
              <QuickActionLink to="/profile#section-services" icon={<Calendar className="w-4 h-4" />} label="Manage availability" />
              <QuickActionLink to="/analytics" icon={<BarChart3 className="w-4 h-4" />} label="View analytics" />
              <QuickActionLink to="/promote" icon={<Megaphone className="w-4 h-4" />} label="Promote services" />
              <QuickActionLink to="/wallet" icon={<Wallet className="w-4 h-4" />} label="Wallet" />
            </>
          )}
        </div>
      </div>

      {/* Care Progress */}
      <CareProgressCard progress={careProgress} />
    </div>
  );
}
