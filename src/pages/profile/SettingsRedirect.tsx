import { Navigate, useLocation } from 'react-router-dom';

const HASH_MAP: Record<string, string> = {
  '#settings-emergency': '#section-contact-privacy',
  '#settings-phone': '#section-contact-privacy',
  '#settings-security': '#section-security',
  '#settings-linked': '#section-security',
  '#settings-notifications': '#section-notifications',
  '#settings-account': '#section-account',
  '#settings-cameras': '#section-policies',
  '#settings-credits': '#section-account',
  '#settings-payouts': '#section-account',
  '#settings-subscription': '#section-account',
};

export default function SettingsRedirect() {
  const { hash } = useLocation();
  const newHash = HASH_MAP[hash] ?? '';
  return <Navigate to={`/profile${newHash}`} replace />;
}
