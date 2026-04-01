import { CreditCard, Building2, Check } from 'lucide-react';
import { formatCents } from '../../lib/money';

type PaymentMethodType = 'card' | 'ach_debit';

interface PaymentMethodSelectorProps {
  selected: PaymentMethodType;
  onSelect: (method: PaymentMethodType) => void;
  amountCents: number;
}

function formatFee(amountCents: number, rate: number): string {
  const fee = Math.round(amountCents * rate);
  return formatCents(fee);
}

export default function PaymentMethodSelector({ selected, onSelect, amountCents }: PaymentMethodSelectorProps) {
  const cardFee = formatFee(amountCents, 0.029);
  const achFee = formatFee(amountCents, 0.008);
  const savings = formatFee(amountCents, 0.029 - 0.008);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-stone-700 mb-2">Payment method</p>

      <button
        onClick={() => onSelect('card')}
        className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-colors text-left ${
          selected === 'card'
            ? 'border-emerald-500 bg-emerald-50'
            : 'border-stone-200 hover:border-stone-300'
        }`}
      >
        <CreditCard className={`w-5 h-5 flex-shrink-0 ${selected === 'card' ? 'text-emerald-600' : 'text-stone-400'}`} />
        <div className="flex-grow min-w-0">
          <p className="text-sm font-medium text-stone-900">Credit/Debit Card</p>
          <p className="text-xs text-stone-500">~{cardFee} processing fee</p>
        </div>
        {selected === 'card' && <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
      </button>

      <button
        onClick={() => onSelect('ach_debit')}
        className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-colors text-left ${
          selected === 'ach_debit'
            ? 'border-emerald-500 bg-emerald-50'
            : 'border-stone-200 hover:border-stone-300'
        }`}
      >
        <Building2 className={`w-5 h-5 flex-shrink-0 ${selected === 'ach_debit' ? 'text-emerald-600' : 'text-stone-400'}`} />
        <div className="flex-grow min-w-0">
          <p className="text-sm font-medium text-stone-900">Bank Transfer (ACH)</p>
          <p className="text-xs text-stone-500">~{achFee} processing fee · Saves ~{savings}</p>
          <p className="text-xs text-stone-400">3-5 business days to process</p>
        </div>
        {selected === 'ach_debit' && <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
      </button>
    </div>
  );
}
