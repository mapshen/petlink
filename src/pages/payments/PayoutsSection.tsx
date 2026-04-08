import { useState, useEffect } from 'react';
import { Clock, CreditCard, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { getAuthHeaders } from '../../context/AuthContext';
import { API_BASE } from '../../config';
import { formatCents } from '../../lib/money';
import { Button } from '../../components/ui/button';
import ConnectSetup from '../../components/payment/ConnectSetup';
import type { SitterPayout } from '../../types';
import { PAYOUT_STATUS_STYLES, PAYOUTS_PAGE_SIZE } from './expenseConstants';

interface PayoutsSectionProps {
  readonly token: string | null;
}

export default function PayoutsSection({ token }: PayoutsSectionProps) {
  const [payouts, setPayouts] = useState<SitterPayout[]>([]);
  const [pendingPayouts, setPendingPayouts] = useState<SitterPayout[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [connectEnabled, setConnectEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    const fetchInitial = async () => {
      setLoading(true);
      try {
        const [payoutsRes, pendingRes, connectRes] = await Promise.all([
          fetch(`${API_BASE}/payouts?limit=${PAYOUTS_PAGE_SIZE}&offset=0`, { headers: getAuthHeaders(token) }),
          fetch(`${API_BASE}/payouts/pending`, { headers: getAuthHeaders(token) }),
          fetch(`${API_BASE}/connect/status`, { headers: getAuthHeaders(token) }),
        ]);
        if (payoutsRes.ok) {
          const data = await payoutsRes.json();
          setPayouts(data.payouts);
          setOffset(data.payouts.length);
          setHasMore(data.payouts.length >= PAYOUTS_PAGE_SIZE);
        }
        if (pendingRes.ok) {
          const data = await pendingRes.json();
          setPendingPayouts(data.payouts);
        }
        if (connectRes.ok) {
          const data = await connectRes.json();
          setConnectEnabled(data.stripe_payouts_enabled ?? false);
        }
      } catch {
        // Non-critical
      } finally {
        setLoading(false);
      }
    };
    fetchInitial();
  }, [token]);

  const fetchMore = async () => {
    setLoadingMore(true);
    try {
      const res = await fetch(`${API_BASE}/payouts?limit=${PAYOUTS_PAGE_SIZE}&offset=${offset}`, { headers: getAuthHeaders(token) });
      if (res.ok) {
        const data = await res.json();
        setPayouts(prev => [...prev, ...data.payouts]);
        setOffset(prev => prev + data.payouts.length);
        setHasMore(data.payouts.length >= PAYOUTS_PAGE_SIZE);
      }
    } catch {
      // Non-critical
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12" role="status">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600" />
        <span className="sr-only">Loading...</span>
      </div>
    );
  }

  if (connectEnabled === false) {
    return <ConnectSetup token={token} />;
  }

  return (
    <div className="space-y-6">
      {/* Pending Summary */}
      {pendingPayouts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-amber-50 rounded-xl p-5 border border-amber-100">
            <div className="flex items-center gap-2 text-amber-700 text-sm font-medium mb-1">
              <Clock className="w-4 h-4" /> Pending Total
            </div>
            <div className="text-2xl font-bold text-amber-700">
              {formatCents(pendingPayouts.reduce((sum, p) => sum + p.amount_cents, 0))}
            </div>
            <div className="text-xs text-amber-600 mt-1">
              {pendingPayouts.length} payout{pendingPayouts.length !== 1 ? 's' : ''} pending
            </div>
          </div>
          <div className="bg-blue-50 rounded-xl p-5 border border-blue-100">
            <div className="flex items-center gap-2 text-blue-700 text-sm font-medium mb-1">
              <CreditCard className="w-4 h-4" /> Next Payout
            </div>
            <div className="text-2xl font-bold text-blue-700">
              {formatCents(pendingPayouts[0].amount_cents)}
            </div>
            <div className="text-xs text-blue-600 mt-1">
              Scheduled {format(new Date(pendingPayouts[0].scheduled_at), 'MMM d, yyyy')}
            </div>
          </div>
        </div>
      )}

      {/* Payouts List */}
      {payouts.length === 0 ? (
        <div className="text-center py-12 bg-stone-50 rounded-xl border border-stone-200">
          <CreditCard className="w-12 h-12 mx-auto mb-4 text-stone-300" />
          <p className="text-stone-500">No payouts yet.</p>
          <p className="text-xs text-stone-400 mt-1">Payouts are scheduled after bookings are completed.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {payouts.map(payout => {
            const style = PAYOUT_STATUS_STYLES[payout.status];
            return (
              <div key={payout.id} className="bg-white rounded-xl border border-stone-100 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-full ${style.bg} flex items-center justify-center`}>
                    <CreditCard className={`w-4 h-4 ${style.text}`} />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-stone-900">
                      Booking #{payout.booking_id}
                    </div>
                    <div className="text-xs text-stone-400">
                      Scheduled {format(new Date(payout.scheduled_at), 'MMM d, yyyy')}
                      {payout.processed_at && (
                        <> &middot; Processed {format(new Date(payout.processed_at), 'MMM d, yyyy')}</>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${style.bg} ${style.text}`}>
                    {style.label}
                  </span>
                  <span className="text-sm font-bold text-emerald-600">
                    {formatCents(payout.amount_cents)}
                  </span>
                </div>
              </div>
            );
          })}

          {hasMore && (
            <div className="flex justify-center pt-4">
              <Button variant="outline" size="sm" onClick={fetchMore} disabled={loadingMore}>
                <ChevronDown className="w-4 h-4" />
                {loadingMore ? 'Loading...' : 'Load More'}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
