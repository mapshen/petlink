import type { User } from '../../types';
import PhonePrivacyForm from './PhonePrivacyForm';
import EmergencyContactForm from './EmergencyContactForm';

interface Props {
  readonly token: string | null;
  readonly user: User | null;
}

export default function ContactPrivacySection({ token, user }: Props) {
  return (
    <div>
      <div>
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
