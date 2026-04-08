import { useEffect, useState } from 'react';
import { Loader2, Receipt } from 'lucide-react';
import { getAuthHeaders } from '../../context/AuthContext';
import { API_BASE } from '../../config';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { format } from 'date-fns';
import { formatCents } from '../../lib/money';

interface PaymentHistoryEntry {
  readonly id: string;
  readonly amount: number;
  readonly status: string;
  readonly description: string;
  readonly created_at: string;
  readonly invoice_id?: string;
}

function statusBadge(status: string) {
  switch (status) {
    case 'succeeded': return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Paid</Badge>;
    case 'pending': return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">Pending</Badge>;
    case 'failed': return <Badge variant="destructive">Failed</Badge>;
    default: return <Badge variant="outline">{status}</Badge>;
  }
}

interface PaymentHistoryListProps {
  readonly token: string | null;
}

export default function PaymentHistoryList({ token }: PaymentHistoryListProps) {
  const [history, setHistory] = useState<PaymentHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHistory = async () => {
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
        setLoading(false);
      }
    };
    fetchHistory();
  }, [token]);

  if (error) {
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="w-5 h-5 animate-spin text-stone-400" />
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-6 bg-stone-50 rounded-xl border border-stone-200">
        <Receipt className="w-8 h-8 mx-auto mb-2 text-stone-300" />
        <p className="text-stone-500 text-sm">No payment history yet.</p>
      </div>
    );
  }

  return (
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
  );
}
