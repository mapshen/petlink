import type { User } from '../../types';

interface Props {
  readonly user: User | null;
}

export default function AccountSection({ user }: Props) {
  if (!user) return null;

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-semibold text-stone-700">Email</div>
        <div className="text-sm text-stone-500 mt-1">{user.email}</div>
      </div>

      <div>
        <div className="text-sm font-semibold text-stone-700">Phone</div>
        <div className="text-sm text-stone-500 mt-1">
          {user.phone || <span className="text-stone-400">Not set</span>}
        </div>
      </div>
    </div>
  );
}
