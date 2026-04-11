import type { CancellationPolicy } from '../../types';
import { getPolicyDescription } from '../../shared/cancellation';

export interface PolicyItem {
  id: string;
  emoji: string;
  title: string;
  description: string;
}

interface LoyaltyInfo {
  tiers: Array<{ min_bookings: number; discount_percent: number }>;
  completed_bookings: number;
}

interface SitterPolicies {
  cancellation_policy?: CancellationPolicy | null;
  house_rules?: string | null;
  emergency_procedures?: string | null;
}

export function buildPolicyItems(
  sitter: SitterPolicies,
  loyaltyInfo: LoyaltyInfo | null
): PolicyItem[] {
  const items: PolicyItem[] = [];

  if (sitter.cancellation_policy) {
    items.push({
      id: 'cancellation',
      emoji: '🛡️',
      title: `${sitter.cancellation_policy.charAt(0).toUpperCase()}${sitter.cancellation_policy.slice(1)} Cancellation`,
      description: getPolicyDescription(sitter.cancellation_policy),
    });
  }

  if (sitter.house_rules) {
    items.push({
      id: 'house_rules',
      emoji: '🏠',
      title: 'House Rules',
      description: sitter.house_rules,
    });
  }

  if (sitter.emergency_procedures) {
    items.push({
      id: 'emergency',
      emoji: '🚨',
      title: 'Emergency Procedures',
      description: sitter.emergency_procedures,
    });
  }

  if (loyaltyInfo && loyaltyInfo.tiers.length > 0) {
    const tierText = loyaltyInfo.tiers
      .map(t => `${t.min_bookings}+ bookings: ${t.discount_percent}% off`)
      .join(' · ');
    items.push({
      id: 'loyalty',
      emoji: '💰',
      title: 'Loyalty Discounts',
      description: tierText,
    });
  }

  return items;
}

interface PoliciesViewProps {
  readonly sitter: SitterPolicies;
  readonly loyaltyInfo: LoyaltyInfo | null;
}

export default function PoliciesView({ sitter, loyaltyInfo }: PoliciesViewProps) {
  const items = buildPolicyItems(sitter, loyaltyInfo);

  if (items.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-5">
      <h3 className="text-lg font-bold text-stone-900 mb-3">Policies</h3>
      <div className="space-y-3">
        {items.map(item => (
          <div key={item.id} className="flex items-start gap-3 bg-stone-50 rounded-xl p-3">
            <span className="text-lg mt-0.5">{item.emoji}</span>
            <div>
              <div className="text-sm font-semibold text-stone-800">{item.title}</div>
              <div className="text-xs text-stone-500 mt-0.5 whitespace-pre-line">{item.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
