import { Navigate, useLocation } from 'react-router-dom';

const HASH_MAP: Record<string, string> = {
  '#settings-emergency': '#section-account',
  '#settings-phone': '#section-account',
  '#settings-security': '#section-security',
  '#settings-linked': '#section-security',
  '#settings-notifications': '#section-notifications',
  '#settings-account': '#section-account',
  '#settings-cameras': '#section-policies',
  '#settings-credits': '/wallet',
  '#settings-payouts': '/wallet',
  '#settings-subscription': '/subscription',
};

export default function SettingsRedirect() {
  const { hash } = useLocation();
  const target = HASH_MAP[hash] ?? '';
  if (target.startsWith('/')) {
    return <Navigate to={target} replace />;
  }
  return <Navigate to={`/profile${target}`} replace />;
}
