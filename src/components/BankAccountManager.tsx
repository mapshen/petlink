import { useEffect, useState } from 'react';
import { useAuth, getAuthHeaders } from '../context/AuthContext';
import { API_BASE } from '../config';
import { Building2, Trash2, Plus, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';

interface BankAccount {
  id: string;
  bank_name: string;
  last4: string;
  status: string;
}

export default function BankAccountManager() {
  const { token } = useAuth();
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    fetchAccounts();
  }, [token]);

  const fetchAccounts = async () => {
    try {
      const res = await fetch(`${API_BASE}/payments/bank-accounts`, {
        headers: getAuthHeaders(token),
      });
      if (!res.ok) {
        if (res.status === 404) {
          setAccounts([]);
          return;
        }
        throw new Error('Failed to load');
      }
      const data = await res.json();
      setAccounts(data.bank_accounts ?? []);
    } catch {
      setError('Failed to load bank accounts.');
    } finally {
      setLoading(false);
    }
  };

  const handleLink = async () => {
    setLinking(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/payments/link-bank`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('Failed to start bank linking');
      // In production, this would open the Financial Connections modal
      // For now, just refresh the list
      await fetchAccounts();
    } catch {
      setError('Failed to link bank account.');
    } finally {
      setLinking(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API_BASE}/payments/bank-accounts/${deleteId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(token),
      });
      if (!res.ok) throw new Error('Failed to remove');
      setAccounts((prev) => prev.filter((a) => a.id !== deleteId));
      setDeleteId(null);
    } catch {
      setError('Failed to remove bank account.');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-6">
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

      {accounts.length === 0 ? (
        <div className="text-center py-6 bg-stone-50 rounded-xl border border-stone-200">
          <Building2 className="w-8 h-8 mx-auto mb-2 text-stone-300" />
          <p className="text-sm text-stone-500">No bank accounts linked.</p>
        </div>
      ) : (
        <div className="space-y-2 mb-4">
          {accounts.map((account) => (
            <div key={account.id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-stone-100">
              <div className="flex items-center gap-3">
                <Building2 className="w-5 h-5 text-blue-600" />
                <div>
                  <p className="text-sm font-medium text-stone-900">{account.bank_name} •••• {account.last4}</p>
                  <p className="text-xs text-stone-400 capitalize">{account.status}</p>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setDeleteId(account.id)} className="text-stone-400 hover:text-red-500">
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Button variant="outline" size="sm" onClick={handleLink} disabled={linking} className="w-full">
        {linking ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
        Link Bank Account
      </Button>

      <AlertDialog open={deleteId !== null} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Bank Account</AlertDialogTitle>
            <AlertDialogDescription>
              This bank account will be unlinked from your PetLink account.
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
