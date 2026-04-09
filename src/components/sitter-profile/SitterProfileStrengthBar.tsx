import { computeStrength } from '../../components/profile/ProfileStrength';
import type { User, Service, SitterPhoto } from '../../types';

interface SitterProfileStrengthBarProps {
  user: User;
  services: Service[];
  photos: SitterPhoto[];
  onEditSection: (sectionId: string) => void;
}

const SECTION_MAP: Record<string, string> = {
  'Upload avatar': 'header',
  'Write bio': 'header',
  'Add services': 'services',
  'Set availability': 'availability',
  'Set location': 'location',
  'Add photos (6+)': 'photos',
  'Get a review': 'reviews',
  'Home info': 'home',
};

export default function SitterProfileStrengthBar({ user, services, photos, onEditSection }: SitterProfileStrengthBarProps) {
  const { completed, total, items } = computeStrength(user, services, photos);
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  if (percent >= 100) return null;

  const incomplete = items.filter(i => !i.done);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-stone-700">Profile Strength</span>
        <span className="text-xs text-stone-500">{completed}/{total} complete</span>
      </div>
      <div className="w-full bg-stone-100 rounded-full h-2 mb-2">
        <div
          className={`h-2 rounded-full transition-all ${percent >= 80 ? 'bg-emerald-500' : percent >= 50 ? 'bg-emerald-400' : 'bg-amber-400'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {incomplete.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {incomplete.map(item => {
            const sectionId = SECTION_MAP[item.label];
            return sectionId ? (
              <button
                key={item.label}
                onClick={() => onEditSection(sectionId)}
                className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer"
              >
                {item.label}
              </button>
            ) : (
              <span key={item.label} className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">
                {item.label}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
