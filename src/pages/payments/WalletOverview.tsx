import { useState, useEffect } from 'react';
import { TrendingUp, Clock, Gift, Receipt } from 'lucide-react';
import { format } from 'date-fns';
import { API_BASE } from '../../config';
import { getAuthHeaders } from '../../context/AuthContext';
import { formatCents } from '../../lib/money';
import type { SitterPayout } from '../../types';
import type { TaxSummary } from './walletTypes';
import { PAYOUT_STATUS_STYLES } from './expenseConstants';

interface WalletOverviewProps {
  readonly year: number;
  readonly token: string | null;
}

interface OverviewState {
  summary: TaxSummary | null;
  pendingPayouts: SitterPayout[];
  creditBalance: number;
  loading: boolean;
}

const INITIAL_STATE: OverviewState = {
  summary: null,
  pendingPayouts: [],
  creditBalance: 0,
  loading: true,
};

export default function WalletOverview({ year, token }: WalletOverviewProps) {
  const [state, setState] = useState<OverviewState>(INITIAL_STATE);

  useEffect(() => {
    const fetchOverviewData = async () => {
      setState(prev => ({ ...prev, loading: true }));
      try {
        const [summaryRes, pendingRes, creditsRes] = await Promise.all([
          fetch(`${API_BASE}/expenses/tax-summary?year=${year}`, { headers: getAuthHeaders(token) }),
          fetch(`${API_BASE}/payouts/pending`, { headers: getAuthHeaders(token) }),
          fetch(`${API_BASE}/credits/balance`, { headers: getAuthHeaders(token) }),
        ]);

        const summary = summaryRes.ok ? await summaryRes.json() : null;
        const pending = pendingRes.ok ? await pendingRes.json() : { payouts: [] };
        const credits = creditsRes.ok ? await creditsRes.json() : { balance_cents: 0 };

        setState({
          summary,
          pendingPayouts: pending.payouts,
          creditBalance: credits.balance_cents,
          loading: false,
        });
      } catch {
        setState(prev => ({ ...prev, loading: false }));
      }
    };

    fetchOverviewData();
  }, [year, token]);

  if (state.loading) {
    return (
      <div className="flex justify-center py-12" role="status">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600" />
        <span className="sr-only">Loading...</span>
      </div>
    );
  }

  const pendingTotal = state.pendingPayouts.reduce((sum, p) => sum + p.amount_cents, 0);
  const nextPayout = state.pendingPayouts[0] ?? null;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Earnings Card */}
        <div className="bg-emerald-50 rounded-xl p-5 border border-emerald-100">
          <div className="flex items-center gap-2 text-emerald-700 text-sm font-medium mb-1">
            <TrendingUp className="w-4 h-4" /> This Year
          </div>
          <div className="text-2xl font-bold text-emerald-700">
            {formatCents(state.summary?.total_income ?? 0)}
          </div>
          <div className="text-xs text-emerald-600 mt-1">Gross earnings</div>
        </div>

        {/* Pending Payout Card */}
        <div className="bg-white rounded-xl p-5 border border-stone-200">
          <div className="flex items-center gap-2 text-amber-700 text-sm font-medium mb-1">
            <Clock className="w-4 h-4" /> Pending Payout
          </div>
          <div className="text-2xl font-bold text-stone-900">
            {formatCents(pendingTotal)}
          </div>
          {nextPayout && (
            <div className="text-xs text-stone-500 mt-1">
              Next: {format(new Date(nextPayout.scheduled_at), 'MMM d, yyyy')}
            </div>
          )}
        </div>

        {/* Credits Card */}
        <div className="bg-white rounded-xl p-5 border border-stone-200">
          <div className="flex items-center gap-2 text-purple-700 text-sm font-medium mb-1">
            <Gift className="w-4 h-4" /> Credits
          </div>
          <div className="text-2xl font-bold text-stone-900">
            {formatCents(state.creditBalance)}
          </div>
          <div className="text-xs text-stone-500 mt-1">Available balance</div>
        </div>

        {/* Expenses Card */}
        <div className="bg-white rounded-xl p-5 border border-stone-200">
          <div className="flex items-center gap-2 text-red-700 text-sm font-medium mb-1">
            <Receipt className="w-4 h-4" /> Expenses
          </div>
          <div className="text-2xl font-bold text-stone-900">
            {formatCents(state.summary?.total_expenses ?? 0)}
          </div>
          <div className="text-xs text-stone-500 mt-1">This year</div>
        </div>
      </div>

      {/* Next Payout Detail */}
      {nextPayout && (
        <div className="bg-white rounded-xl border border-stone-100 p-6">
          <h3 className="font-bold text-stone-900 mb-4">Next Payout</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-stone-600">Amount</span>
              <span className="text-lg font-bold text-emerald-700">{formatCents(nextPayout.amount_cents)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-stone-600">Scheduled</span>
              <span className="text-sm text-stone-900">{format(new Date(nextPayout.scheduled_at), 'MMM d, yyyy')}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-stone-600">Status</span>
              {(() => {
                const style = PAYOUT_STATUS_STYLES[nextPayout.status];
                return (
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${style.bg} ${style.text}`}>
                    {style.label}
                  </span>
                );
              })()}
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-stone-600">Booking</span>
              <span className="text-sm text-stone-900">#{nextPayout.booking_id}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
