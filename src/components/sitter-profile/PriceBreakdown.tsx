import { formatCents } from '../../lib/money';
import { getAddonBySlug } from '../../shared/addon-catalog';

interface PricingBreakdown {
  baseCents: number;
  extraPetsCents: number;
  pickupDropoffCents: number;
  groomingCents: number;
  addonDetails: Array<{ slug: string; priceCents: number }>;
  discountCents: number;
  discountPercent?: number;
  holidayApplied?: boolean;
  puppyApplied?: boolean;
}

interface PriceBreakdownProps {
  breakdown: PricingBreakdown;
  totalCents: number;
  extraPetCount: number;
}

export default function PriceBreakdown({ breakdown, totalCents, extraPetCount }: PriceBreakdownProps) {
  return (
    <div className="p-3 bg-stone-50 rounded-xl space-y-1">
      <div className="flex justify-between text-sm text-stone-600">
        <span>
          {breakdown.holidayApplied ? 'Holiday rate' : breakdown.puppyApplied ? 'Puppy/kitten rate' : 'Base price'}
        </span>
        <span>{formatCents(breakdown.baseCents)}</span>
      </div>
      {breakdown.extraPetsCents > 0 && (
        <div className="flex justify-between text-sm text-stone-600">
          <span>{extraPetCount} extra pet{extraPetCount > 1 ? 's' : ''}</span>
          <span>{formatCents(breakdown.extraPetsCents)}</span>
        </div>
      )}
      {breakdown.pickupDropoffCents > 0 && (
        <div className="flex justify-between text-sm text-stone-600">
          <span>Pickup & drop-off</span>
          <span>{formatCents(breakdown.pickupDropoffCents)}</span>
        </div>
      )}
      {breakdown.groomingCents > 0 && (
        <div className="flex justify-between text-sm text-stone-600">
          <span>Grooming add-on</span>
          <span>{formatCents(breakdown.groomingCents)}</span>
        </div>
      )}
      {breakdown.addonDetails.map((a) => {
        const addonDef = getAddonBySlug(a.slug);
        return (
          <div key={a.slug} className="flex justify-between text-sm text-stone-600">
            <span>{addonDef?.emoji} {addonDef?.label ?? a.slug}</span>
            <span>{a.priceCents === 0 ? 'Free' : formatCents(a.priceCents)}</span>
          </div>
        );
      })}
      {breakdown.discountCents > 0 && (
        <div className="flex justify-between text-sm text-emerald-600">
          <span>Loyalty discount ({breakdown.discountPercent}%)</span>
          <span>-{formatCents(breakdown.discountCents)}</span>
        </div>
      )}
      <div className="flex justify-between text-sm font-bold text-stone-900 pt-1 border-t border-stone-200">
        <span>Total</span>
        <span>{formatCents(totalCents)}</span>
      </div>
    </div>
  );
}
