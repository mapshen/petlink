import type { User, Service, SitterPhoto } from '../../types';

interface Props {
  readonly user: User;
  readonly services: Service[];
  readonly photos: SitterPhoto[];
}

interface CheckItem {
  label: string;
  done: boolean;
}

function computeStrength(user: User, services: Service[], photos: SitterPhoto[]): { percentage: number; items: CheckItem[] } {
  const items: CheckItem[] = [
    { label: 'Added bio and photo', done: !!(user.bio && user.avatar_url) },
    { label: 'Set up services with pricing', done: services.length > 0 },
    { label: 'Uploaded portfolio photos', done: photos.length > 0 },
    { label: 'Set availability schedule', done: false }, // Would need availability data
    { label: 'Added policies and house rules', done: !!(user.cancellation_policy || user.house_rules) },
    { label: 'Set pet types and experience', done: (user.accepted_species?.length ?? 0) > 0 },
    { label: 'Complete background verification', done: false }, // Would need verification data
  ];

  const completed = items.filter((i) => i.done).length;
  const percentage = Math.round((completed / items.length) * 100);

  return { percentage, items };
}

export default function ProfileStrength({ user, services, photos }: Props) {
  const { percentage, items } = computeStrength(user, services, photos);

  const barColor = percentage >= 80 ? 'bg-emerald-500' : percentage >= 50 ? 'bg-blue-500' : 'bg-amber-400';

  return (
    <div className="mt-3 p-4 bg-blue-50 border border-blue-200 rounded-2xl">
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-xs font-bold text-blue-900">Profile strength</span>
        <span className="text-xs font-bold text-blue-600">{percentage}%</span>
      </div>
      <div className="h-1.5 bg-blue-100 rounded-full mb-3">
        <div className={`h-1.5 rounded-full transition-all ${barColor}`} style={{ width: `${percentage}%` }} />
      </div>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li
            key={item.label}
            className={`text-xs flex items-center gap-1.5 ${item.done ? 'text-emerald-600' : 'text-stone-500'}`}
          >
            {item.done ? '\u2713' : '\u25E6'}
            <span className={item.done ? '' : ''}>{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export { computeStrength };
