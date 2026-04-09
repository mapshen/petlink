import { Check, Circle } from 'lucide-react';
import type { User, Service, SitterPhoto } from '../../types';

interface Props {
  readonly user: User;
  readonly services: Service[];
  readonly photos: SitterPhoto[];
}

interface CheckItem {
  label: string;
  done: boolean;
  href: string;
}

function computeStrength(user: User, services: Service[], photos: SitterPhoto[]): { completed: number; total: number; items: CheckItem[] } {
  const items: CheckItem[] = [
    { label: 'Upload avatar', done: !!user.avatar_url, href: '#section-about' },
    { label: 'Write bio', done: !!user.bio, href: '#section-about' },
    { label: 'Add services', done: services.length > 0, href: '#section-services' },
    { label: 'Set location', done: !!(user.lat && user.lng), href: '#section-location' },
    { label: 'Upload photos', done: photos.length > 0, href: '#section-photos' },
    { label: 'Set pet types and experience', done: (user.accepted_species?.length ?? 0) > 0, href: '#section-services' },
  ];

  const completed = items.filter((i) => i.done).length;
  return { completed, total: items.length, items };
}

export default function ProfileStrength({ user, services, photos }: Props) {
  const { completed, total, items } = computeStrength(user, services, photos);
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const barColor = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-emerald-400' : 'bg-amber-400';

  return (
    <div className="mt-3 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-xs font-bold text-emerald-900">Profile strength</span>
        <span className="text-xs font-bold text-emerald-700">{completed}/{total}</span>
      </div>
      <div className="h-1.5 bg-emerald-100 rounded-full mb-3">
        <div className={`h-1.5 rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item.label}>
            {item.done ? (
              <span className="text-xs flex items-center gap-1.5 text-emerald-600">
                <Check className="w-3.5 h-3.5" />
                {item.label}
              </span>
            ) : (
              <a href={item.href} className="text-xs flex items-center gap-1.5 text-stone-500 hover:text-emerald-600 transition-colors">
                <Circle className="w-3.5 h-3.5" />
                {item.label}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export { computeStrength };
