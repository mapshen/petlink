import React, { useEffect, useState } from 'react';
import { useAuth, getAuthHeaders } from '../context/AuthContext';
import { LinkedAccount, OAuthProvider } from '../types';
import { Loader2 } from 'lucide-react';
import { API_BASE } from '../config';
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

const PROVIDERS: { id: OAuthProvider; label: string; icon: React.ReactNode; colors: string }[] = [
  {
    id: 'google',
    label: 'Google',
    colors: '',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
    ),
  },
  {
    id: 'apple',
    label: 'Apple',
    colors: '',
    icon: (
      <svg className="w-5 h-5 text-stone-900" fill="currentColor" viewBox="0 0 24 24">
        <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
      </svg>
    ),
  },
  {
    id: 'facebook',
    label: 'Facebook',
    colors: '',
    icon: (
      <svg className="w-5 h-5 text-[#1877F2]" fill="currentColor" viewBox="0 0 24 24">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    ),
  },
];

export default function LinkedAccounts() {
  const { token } = useAuth();
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unlinkingProvider, setUnlinkingProvider] = useState<OAuthProvider | null>(null);
  const [unlinkDialogProvider, setUnlinkDialogProvider] = useState<OAuthProvider | null>(null);

  useEffect(() => {
    fetchAccounts();
  }, [token]);

  const fetchAccounts = async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/linked-accounts`, {
        headers: getAuthHeaders(token),
      });
      if (!res.ok) throw new Error('Failed to load linked accounts');
      const data = await res.json();
      setAccounts(data.accounts);
    } catch {
      setError('Failed to load linked accounts.');
    } finally {
      setLoading(false);
    }
  };

  const handleUnlink = async (provider: OAuthProvider) => {
    setUnlinkingProvider(provider);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/auth/linked-accounts/${provider}`, {
        method: 'DELETE',
        headers: getAuthHeaders(token),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to unlink account');
      }
      setAccounts((prev) => prev.filter((a) => a.provider !== provider));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlink account.');
    } finally {
      setUnlinkingProvider(null);
      setUnlinkDialogProvider(null);
    }
  };

  if (loading) return null;

  return (
    <div className="mt-8 pt-6 border-t border-stone-100">
      <h3 className="text-sm font-bold text-stone-900 mb-4">Linked Accounts</h3>

      {error && (
        <div className="text-xs text-red-600 mb-3 bg-red-50 p-2 rounded-lg">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      <div className="space-y-3">
        {PROVIDERS.map((provider) => {
          const linked = accounts.find((a) => a.provider === provider.id);
          return (
            <div key={provider.id} className="flex items-center justify-between p-3 border border-stone-100 rounded-xl">
              <div className="flex items-center gap-3">
                {provider.icon}
                <div>
                  <p className="text-sm font-medium text-stone-900">{provider.label}</p>
                  <p className="text-xs text-stone-400">
                    {linked ? linked.email || 'Connected' : 'Not connected'}
                  </p>
                </div>
              </div>
              {linked ? (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full font-medium">Connected</span>
                  <button
                    onClick={() => setUnlinkDialogProvider(provider.id)}
                    disabled={unlinkingProvider === provider.id}
                    className="text-xs text-stone-400 hover:text-red-500 font-medium disabled:opacity-50"
                  >
                    {unlinkingProvider === provider.id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Unlink'}
                  </button>
                </div>
              ) : (
                <button className="text-xs text-emerald-600 hover:text-emerald-700 font-medium border border-emerald-200 px-3 py-1 rounded-lg hover:bg-emerald-50">
                  Connect
                </button>
              )}
            </div>
          );
        })}
      </div>

      <AlertDialog open={unlinkDialogProvider !== null} onOpenChange={(open) => { if (!open) setUnlinkDialogProvider(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlink Account</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to unlink this account? You can reconnect it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => { if (unlinkDialogProvider) handleUnlink(unlinkDialogProvider); }}>
              Unlink
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
