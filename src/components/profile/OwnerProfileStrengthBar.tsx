import type { Pet } from '../../types';
import type { OwnerProfileData } from '../../hooks/useProfileData';

interface OwnerProfileStrengthBarProps {
  owner: OwnerProfileData['owner'];
  pets: Pet[];
  onEditSection: (sectionId: string) => void;
}

interface StrengthItem {
  label: string;
  done: boolean;
  sectionId: string;
}

export function computeOwnerStrength(owner: OwnerProfileData['owner'], pets: Pet[]): { completed: number; total: number; items: StrengthItem[] } {
  const items: StrengthItem[] = [
    { label: 'Upload avatar', done: !!owner.avatar_url, sectionId: 'header' },
    { label: 'Write bio', done: !!owner.bio, sectionId: 'header' },
    { label: 'Add a pet', done: pets.length > 0, sectionId: 'pets' },
  ];
  const completed = items.filter(i => i.done).length;
  return { completed, total: items.length, items };
}

export default function OwnerProfileStrengthBar({ owner, pets, onEditSection }: OwnerProfileStrengthBarProps) {
  const { completed, total, items } = computeOwnerStrength(owner, pets);
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
          className={`h-2 rounded-full transition-all ${percent >= 67 ? 'bg-emerald-500' : percent >= 34 ? 'bg-emerald-400' : 'bg-amber-400'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {incomplete.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {incomplete.map(item => (
            <button
              key={item.label}
              onClick={() => onEditSection(item.sectionId)}
              className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
