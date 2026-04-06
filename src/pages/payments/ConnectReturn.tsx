import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { API_BASE } from '../../config';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

export default function ConnectReturn() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'incomplete'>('loading');

  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await fetch(`${API_BASE}/connect/status`, {
          headers: getAuthHeaders(token),
        });
        if (res.ok) {
          const data = await res.json();
          setStatus(data.stripe_payouts_enabled ? 'success' : 'incomplete');
        } else {
          setStatus('incomplete');
        }
      } catch {
        setStatus('incomplete');
      }
    }
    checkStatus();
  }, [token]);

  return (
    <div className="max-w-lg mx-auto px-4 py-20 text-center">
      {status === 'loading' && (
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 text-emerald-500 animate-spin" />
          <p className="text-stone-600">Checking your payout setup...</p>
        </div>
      )}

      {status === 'success' && (
        <div className="flex flex-col items-center gap-4">
          <CheckCircle className="w-16 h-16 text-emerald-500" />
          <h1 className="text-2xl font-bold text-stone-900">Payouts Enabled!</h1>
          <p className="text-stone-600">Your payout account is set up. You can now accept bookings and receive payments directly to your bank account.</p>
          <button
            onClick={() => navigate('/settings')}
            className="mt-4 px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors"
          >
            Go to Settings
          </button>
        </div>
      )}

      {status === 'incomplete' && (
        <div className="flex flex-col items-center gap-4">
          <AlertCircle className="w-16 h-16 text-amber-500" />
          <h1 className="text-2xl font-bold text-stone-900">Setup Incomplete</h1>
          <p className="text-stone-600">Your payout setup isn't complete yet. You can finish it from your settings page.</p>
          <button
            onClick={() => navigate('/settings')}
            className="mt-4 px-6 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors"
          >
            Go to Settings
          </button>
        </div>
      )}
    </div>
  );
}
