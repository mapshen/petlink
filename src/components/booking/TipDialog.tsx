import { useState } from 'react';
import { Heart } from 'lucide-react';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { API_BASE } from '../../config';
import { formatCents } from '../../lib/money';
import PaymentForm from '../payment/PaymentForm';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '../ui/alert-dialog';

const SUGGESTED_PERCENTS = [15, 20, 25];

interface Props {
  readonly bookingId: number;
  readonly bookingTotalCents: number;
  readonly sitterName: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onTipSent: () => void;
}

export default function TipDialog({ bookingId, bookingTotalCents, sitterName, open, onOpenChange, onTipSent }: Props) {
  const { token } = useAuth();
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [tipId, setTipId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const suggestedTips = SUGGESTED_PERCENTS.map((pct) => ({
    percent: pct,
    amount_cents: Math.round(bookingTotalCents * (pct / 100)),
  }));

  const effectiveAmount = selectedAmount ?? (customAmount ? Math.round(parseFloat(customAmount) * 100) : 0);

  const handleSubmit = async () => {
    if (effectiveAmount <= 0) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/tips`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify({ booking_id: bookingId, amount_cents: effectiveAmount }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create tip');
      }
      const data = await res.json();
      setClientSecret(data.clientSecret);
      setTipId(data.tip.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process tip');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePaymentSuccess = async () => {
    // Confirm the tip on the backend
    if (tipId) {
      await fetch(`${API_BASE}/tips/${tipId}/confirm`, {
        method: 'POST',
        headers: getAuthHeaders(token),
      }).catch(() => {});
    }
    onTipSent();
    onOpenChange(false);
  };

  const handleClose = () => {
    setSelectedAmount(null);
    setCustomAmount('');
    setClientSecret(null);
    setTipId(null);
    setError(null);
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-pink-500" />
            Tip {sitterName}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Show your appreciation for great service!
          </AlertDialogDescription>
        </AlertDialogHeader>

        {!clientSecret ? (
          <div className="space-y-4">
            {/* Suggested amounts */}
            <div className="grid grid-cols-3 gap-2">
              {suggestedTips.map(({ percent, amount_cents }) => (
                <button
                  key={percent}
                  type="button"
                  onClick={() => { setSelectedAmount(amount_cents); setCustomAmount(''); }}
                  className={`p-3 rounded-xl border text-center transition-all ${
                    selectedAmount === amount_cents
                      ? 'border-pink-500 bg-pink-50 ring-1 ring-pink-500'
                      : 'border-stone-200 hover:border-pink-200'
                  }`}
                >
                  <div className="text-lg font-bold text-stone-900">{percent}%</div>
                  <div className="text-xs text-stone-500">{formatCents(amount_cents)}</div>
                </button>
              ))}
            </div>

            {/* Custom amount */}
            <div>
              <label className="text-sm font-medium text-stone-700 block mb-1">Custom amount</label>
              <div className="flex items-center gap-2">
                <span className="text-stone-400">$</span>
                <input
                  type="number"
                  min={0.01}
                  max={1000}
                  step={0.01}
                  value={customAmount}
                  onChange={(e) => { setCustomAmount(e.target.value); setSelectedAmount(null); }}
                  placeholder="0.00"
                  className="w-full p-2 border border-stone-200 rounded-lg text-sm"
                />
              </div>
            </div>

            {error && (
              <div className="text-sm text-red-600 bg-red-50 p-2 rounded-lg">{error}</div>
            )}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || effectiveAmount <= 0}
              className="w-full bg-pink-500 text-white py-3 rounded-xl font-semibold hover:bg-pink-600 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Processing...' : effectiveAmount > 0 ? `Tip ${formatCents(effectiveAmount)}` : 'Select an amount'}
            </button>
          </div>
        ) : (
          <PaymentForm
            clientSecret={clientSecret}
            amount={effectiveAmount}
            onSuccess={handlePaymentSuccess}
            onError={(msg) => setError(msg)}
          />
        )}

        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleClose}>
            {clientSecret ? 'Cancel' : 'Maybe later'}
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
