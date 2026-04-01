import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { API_BASE } from '../../config';
import { CreditCard, History, Loader2, Receipt } from 'lucide-react';
import { Badge } from '../../components/ui/badge';
import { Alert, AlertDescription } from '../../components/ui/alert';
import SavedPaymentMethods from '../../components/payment/SavedPaymentMethods';
import { format } from 'date-fns';
import { formatCents } from '../../lib/money';

interface PaymentHistoryEntry {
  id: string;
  amount: number;
  status: string;
  description: string;
  created_at: string;
  invoice_id?: string;
}

type Tab = 'methods' | 'history';

export default function PaymentHistoryPage() {
  const { user, token, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<Tab>('methods');
  const [history, setHistory] = useState<PaymentHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`${API_BASE}/payment-history`, {
        headers: getAuthHeaders(token),
      });
      if (!res.ok) {
        if (res.status === 404) {
          setHistory([]);
          return;
        }
        throw new Error('Failed to load');
      }
      const data = await res.json();
      setHistory(data.payments ?? []);
    } catch {
      setError('Failed to load payment history.');
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (tab !== 'history') return;
    fetchHistory();
  }, [tab, token]);

  if (authLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-emerald-600" /></div>;
  }
  if (!user) return <Navigate to="/login" replace />;

  const statusBadge = (status: string) => {
    switch (status) {
      case 'succeeded': return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Paid</Badge>;
      case 'pending': return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Pending</Badge>;
      case 'failed': return <Badge variant="destructive">Failed</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-stone-900 mb-8">Payments</h1>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setTab('methods')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'methods' ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
          }`}
        >
          <CreditCard className="w-4 h-4 inline mr-1.5" />
          Payment Methods
        </button>
        <button
          onClick={() => setTab('history')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            tab === 'history' ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
          }`}
        >
          <History className="w-4 h-4 inline mr-1.5" />
          History
        </button>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {tab === 'methods' && <SavedPaymentMethods />}

      {tab === 'history' && (
        historyLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
          </div>
        ) : history.length === 0 ? (
          <div className="text-center py-8 bg-stone-50 rounded-xl border border-stone-200">
            <Receipt className="w-10 h-10 mx-auto mb-3 text-stone-300" />
            <p className="text-stone-500 text-sm">No payment history yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between p-4 bg-white rounded-xl border border-stone-100">
                <div>
                  <p className="text-sm font-medium text-stone-900">{entry.description || 'Payment'}</p>
                  <p className="text-xs text-stone-400">{format(new Date(entry.created_at), 'MMM d, yyyy')}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-stone-900">{formatCents(entry.amount)}</span>
                  {statusBadge(entry.status)}
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
