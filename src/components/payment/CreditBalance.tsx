import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../../config';
import { getAuthHeaders } from '../../context/AuthContext';
import { formatCents } from '../../lib/money';
import type { CreditEntry } from '../../types';
import { Coins, Plus, Minus, Loader2, ChevronDown } from 'lucide-react';

interface CreditBalanceProps {
  token: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  referral: 'Referral Bonus',
  dispute_resolution: 'Dispute Credit',
  promo: 'Promotional Credit',
  beta_reward: 'Beta Reward',
  milestone: 'Milestone Reward',
  redemption: 'Redeemed',
  expiration: 'Expired',
};

const PAGE_SIZE = 10;

export default function CreditBalance({ token }: CreditBalanceProps) {
  const [balance, setBalance] = useState<number | null>(null);
  const [entries, setEntries] = useState<CreditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const fetchBalance = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/credits/balance`, {
        headers: getAuthHeaders(token),
      });
      if (res.ok) {
        const data = await res.json();
        setBalance(data.balance_cents);
      }
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  const fetchHistory = async (newOffset = 0) => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`${API_BASE}/credits/history?limit=${PAGE_SIZE}&offset=${newOffset}`, {
        headers: getAuthHeaders(token),
      });
      if (res.ok) {
        const data = await res.json();
        if (newOffset === 0) {
          setEntries(data.entries);
        } else {
          setEntries((prev) => [...prev, ...data.entries]);
        }
        setHasMore(data.entries.length === PAGE_SIZE);
        setOffset(newOffset + data.entries.length);
      }
    } catch {
      // Non-critical
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleToggleHistory = () => {
    if (!showHistory && entries.length === 0) {
      fetchHistory(0);
    }
    setShowHistory((prev) => !prev);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-stone-400 text-sm py-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading credits...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Balance */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
          <Coins className="w-5 h-5 text-emerald-600" />
          <span className="text-lg font-bold text-emerald-700">{formatCents(balance ?? 0)}</span>
        </div>
        <span className="text-sm text-stone-500">available credits</span>
      </div>

      {balance === 0 && (
        <p className="text-sm text-stone-500">You don't have any credits yet. Credits can be earned through referrals, dispute resolutions, and promotions.</p>
      )}

      {/* History toggle */}
      <button
        onClick={handleToggleHistory}
        className="flex items-center gap-1 text-sm text-stone-600 hover:text-stone-900 transition-colors"
      >
        <ChevronDown className={`w-4 h-4 transition-transform ${showHistory ? 'rotate-180' : ''}`} />
        {showHistory ? 'Hide' : 'View'} credit history
      </button>

      {/* History list */}
      {showHistory && (
        <div className="space-y-2">
          {entries.length === 0 && !historyLoading && (
            <p className="text-sm text-stone-400 py-2">No credit history yet.</p>
          )}
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between py-2 border-b border-stone-50 last:border-0">
              <div className="flex items-center gap-2.5">
                {entry.amount_cents > 0 ? (
                  <Plus className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Minus className="w-4 h-4 text-red-500" />
                )}
                <div>
                  <div className="text-sm font-medium text-stone-800">
                    {TYPE_LABELS[entry.type] || entry.type}
                  </div>
                  <div className="text-xs text-stone-400">{entry.description}</div>
                </div>
              </div>
              <div className="text-right">
                <div className={`text-sm font-semibold ${entry.amount_cents > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {entry.amount_cents > 0 ? '+' : ''}{formatCents(entry.amount_cents)}
                </div>
                <div className="text-xs text-stone-400">
                  {new Date(entry.created_at).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
          {hasMore && entries.length > 0 && (
            <button
              onClick={() => fetchHistory(offset)}
              disabled={historyLoading}
              className="w-full text-center py-2 text-sm text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
            >
              {historyLoading ? 'Loading...' : 'Load more'}
            </button>
          )}
          {historyLoading && entries.length === 0 && (
            <div className="flex items-center gap-2 text-stone-400 text-sm py-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading history...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
