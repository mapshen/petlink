import type { User } from '../../types';

interface Props {
  readonly token: string | null;
  readonly user: User | null;
}

export default function AccountSection({ user }: Props) {
  if (!user) return null;

  const roles = user.roles ?? ['owner'];

  return (
    <div className="space-y-4">
      <div>
        <div className="text-sm font-semibold text-stone-700">Email</div>
        <div className="text-sm text-stone-500 mt-1">{user.email}</div>
      </div>

      <div>
        <div className="text-sm font-semibold text-stone-700">Roles</div>
        <div className="flex gap-2 mt-1">
          {roles.map((role) => (
            <span
              key={role}
              className="inline-block px-2 py-0.5 text-xs font-medium rounded-full bg-stone-100 text-stone-600 capitalize"
            >
              {role}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
