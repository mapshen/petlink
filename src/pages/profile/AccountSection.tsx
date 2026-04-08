import type { User } from '../../types';
import PhonePrivacyForm from './PhonePrivacyForm';
import EmergencyContactForm from './EmergencyContactForm';

interface Props {
  readonly token: string | null;
  readonly user: User | null;
}

export default function AccountSection({ token, user }: Props) {
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

      <div className="border-t pt-6 mt-6">
        <h3 className="text-base font-semibold text-stone-800 mb-4">Phone & Privacy</h3>
        <PhonePrivacyForm token={token} user={user} />
      </div>

      <div className="border-t pt-6 mt-6">
        <h3 className="text-base font-semibold text-stone-800 mb-4">Emergency Contact</h3>
        <EmergencyContactForm token={token} user={user} />
      </div>
    </div>
  );
}
