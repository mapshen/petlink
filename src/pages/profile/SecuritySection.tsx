import PasswordSection from './PasswordSection';
import LinkedAccounts from '../../components/profile/LinkedAccounts';

interface Props {
  readonly token: string | null;
}

export default function SecuritySection({ token }: Props) {
  return (
    <div>
      <div>
        <h3 className="text-base font-semibold text-stone-800 mb-4">Password</h3>
        <PasswordSection token={token} />
      </div>

      <div className="border-t pt-6 mt-6">
        <h3 className="text-base font-semibold text-stone-800 mb-4">Linked Accounts</h3>
        <LinkedAccounts embedded />
      </div>
    </div>
  );
}
