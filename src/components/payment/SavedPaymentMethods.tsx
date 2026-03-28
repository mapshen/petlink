import { useEffect, useState } from 'react';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { API_BASE } from '../../config';
import { CreditCard, Trash2, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Alert, AlertDescription } from '../ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';

interface PaymentMethod {
  id: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
}

export default function SavedPaymentMethods() {
  const { token } = useAuth();
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    fetchMethods();
  }, [token]);

  const fetchMethods = async () => {
    try {
      const res = await fetch(`${API_BASE}/payment-methods`, {
        headers: getAuthHeaders(token),
      });
      if (!res.ok) {
        if (res.status === 404) {
          setMethods([]);
          return;
        }
        throw new Error('Failed to load');
      }
      const data = await res.json();
      setMethods(data.payment_methods ?? []);
    } catch {
      setError('Failed to load payment methods.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE}/payment-methods/${deleteId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(token),
      });
      if (!res.ok) throw new Error('Failed to remove');
      setMethods((prev) => prev.filter((m) => m.id !== deleteId));
      setDeleteId(null);
    } catch {
      setError('Failed to remove payment method.');
    } finally {
      setDeleting(false);
    }
  };

  const brandIcon = (brand: string) => {
    const colors: Record<string, string> = {
      visa: 'text-blue-600',
      mastercard: 'text-red-500',
      amex: 'text-blue-400',
    };
    return colors[brand.toLowerCase()] || 'text-stone-500';
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div>
      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {methods.length === 0 ? (
        <div className="text-center py-8 bg-stone-50 rounded-xl border border-stone-200">
          <CreditCard className="w-10 h-10 mx-auto mb-3 text-stone-300" />
          <p className="text-stone-500 text-sm">No saved payment methods.</p>
          <p className="text-xs text-stone-400 mt-1">Cards will be saved when you make a payment.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {methods.map((method) => (
            <div key={method.id} className="flex items-center justify-between p-4 bg-white rounded-xl border border-stone-100">
              <div className="flex items-center gap-3">
                <CreditCard className={`w-5 h-5 ${brandIcon(method.brand)}`} />
                <div>
                  <p className="text-sm font-medium text-stone-900 capitalize">{method.brand} •••• {method.last4}</p>
                  <p className="text-xs text-stone-400">Expires {method.exp_month}/{method.exp_year}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeleteId(method.id)}
                className="text-stone-400 hover:text-red-500"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Payment Method</AlertDialogTitle>
            <AlertDialogDescription>
              This card will be removed from your account.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
