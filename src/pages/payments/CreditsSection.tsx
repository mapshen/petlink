import { useState, useEffect } from 'react';
import { Gift, TrendingUp, TrendingDown } from 'lucide-react';
import { format } from 'date-fns';
import { getAuthHeaders } from '../../context/AuthContext';
import { API_BASE } from '../../config';
import { formatCents } from '../../lib/money';
import type { CreditEntry } from '../../types';

interface CreditsSectionProps {
  readonly token: string | null;
}

export default function CreditsSection({ token }: CreditsSectionProps) {
  const [creditBalance, setCreditBalance] = useState(0);
  const [creditHistory, setCreditHistory] = useState<CreditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCredits = async () => {
      setLoading(true);
      try {
        const [balRes, histRes] = await Promise.all([
          fetch(`${API_BASE}/credits/balance`, { headers: getAuthHeaders(token) }),
          fetch(`${API_BASE}/credits/history?limit=50`, { headers: getAuthHeaders(token) }),
        ]);
        if (balRes.ok) {
          const data = await balRes.json();
          setCreditBalance(data.balance_cents);
        }
        if (histRes.ok) {
          const data = await histRes.json();
          setCreditHistory(data.entries);
        }
      } catch {
        // Non-critical
      } finally {
        setLoading(false);
      }
    };
    fetchCredits();
  }, [token]);

  if (loading) {
    return (
      <div className="flex justify-center py-12" role="status">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600" />
        <span className="sr-only">Loading...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Balance Card */}
      <div className="bg-emerald-50 rounded-xl p-6 border border-emerald-100">
        <div className="flex items-center gap-2 text-emerald-700 text-sm font-medium mb-1">
          <Gift className="w-4 h-4" /> Credit Balance
        </div>
        <div className="text-3xl font-bold text-emerald-700">{formatCents(creditBalance)}</div>
        <p className="text-xs text-emerald-600 mt-2">Credits auto-apply to your subscription renewals</p>
      </div>

      {/* Credit History */}
      {creditHistory.length === 0 ? (
        <div className="text-center py-12 bg-stone-50 rounded-xl border border-stone-200">
          <Gift className="w-12 h-12 mx-auto mb-4 text-stone-300" />
          <p className="text-stone-500">No credit history yet.</p>
          <p className="text-xs text-stone-400 mt-1">Credits from referrals, promotions, and rewards will appear here.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {creditHistory.map(entry => (
            <div key={entry.id} className="bg-white rounded-xl border border-stone-100 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${entry.amount_cents > 0 ? 'bg-emerald-100' : 'bg-red-100'}`}>
                  {entry.amount_cents > 0
                    ? <TrendingUp className="w-4 h-4 text-emerald-600" />
                    : <TrendingDown className="w-4 h-4 text-red-600" />}
                </div>
                <div>
                  <div className="text-sm font-medium text-stone-900">{entry.description}</div>
                  <div className="text-xs text-stone-400">
                    {format(new Date(entry.created_at), 'MMM d, yyyy')}
                    <span className="ml-2 px-1.5 py-0.5 bg-stone-100 text-stone-500 rounded text-[10px]">
                      {entry.type.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
              </div>
              <span className={`text-sm font-semibold ${entry.amount_cents > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {entry.amount_cents > 0 ? '+' : ''}{formatCents(entry.amount_cents)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
