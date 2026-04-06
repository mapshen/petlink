import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../../config';
import { getAuthHeaders } from '../../context/AuthContext';
import type { ConnectStatus } from '../../types';
import { ExternalLink, CheckCircle, AlertCircle, Clock, Loader2 } from 'lucide-react';

interface ConnectSetupProps {
  token: string | null;
}

interface ConnectInfo {
  stripe_account_id: string | null;
  stripe_connect_status: ConnectStatus;
  stripe_payouts_enabled: boolean;
  stripe_charges_enabled: boolean;
}

const STATUS_CONFIG: Record<ConnectStatus, { label: string; color: string; icon: React.ElementType; description: string }> = {
  not_started: {
    label: 'Not Started',
    color: 'text-stone-500 bg-stone-100',
    icon: Clock,
    description: 'Set up your payout account to start accepting bookings.',
  },
  onboarding: {
    label: 'In Progress',
    color: 'text-amber-700 bg-amber-100',
    icon: Clock,
    description: 'Complete your Stripe onboarding to enable payouts.',
  },
  active: {
    label: 'Active',
    color: 'text-emerald-700 bg-emerald-100',
    icon: CheckCircle,
    description: 'Your payout account is active. Funds are deposited directly to your bank.',
  },
  restricted: {
    label: 'Action Required',
    color: 'text-amber-700 bg-amber-100',
    icon: AlertCircle,
    description: 'Stripe needs additional information. Update your account to continue receiving payouts.',
  },
  disabled: {
    label: 'Disabled',
    color: 'text-red-700 bg-red-100',
    icon: AlertCircle,
    description: 'Your payout account has been disabled. Please update your information.',
  },
};

export default function ConnectSetup({ token }: ConnectSetupProps) {
  const [info, setInfo] = useState<ConnectInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/connect/status`, {
        headers: getAuthHeaders(token),
      });
      if (res.ok) {
        setInfo(await res.json());
      }
    } catch {
      setError('Failed to load payout status');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleSetup = async () => {
    setActionLoading(true);
    setError('');
    try {
      // Create account if needed
      if (!info?.stripe_account_id) {
        const createRes = await fetch(`${API_BASE}/connect/account`, {
          method: 'POST',
          headers: getAuthHeaders(token),
        });
        if (!createRes.ok) {
          const data = await createRes.json().catch(() => ({}));
          setError(data.error || 'Failed to create payout account');
          return;
        }
      }

      // Get onboarding link
      const linkRes = await fetch(`${API_BASE}/connect/onboarding-link`, {
        method: 'POST',
        headers: { ...getAuthHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!linkRes.ok) {
        const data = await linkRes.json().catch(() => ({}));
        setError(data.error || 'Failed to generate onboarding link');
        return;
      }
      const { url } = await linkRes.json();
      window.location.href = url;
    } catch {
      setError('Failed to start payout setup');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdate = async () => {
    setActionLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/connect/onboarding-link`, {
        method: 'POST',
        headers: { ...getAuthHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'account_update' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to generate update link');
        return;
      }
      const { url } = await res.json();
      window.location.href = url;
    } catch {
      setError('Failed to open account settings');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-stone-400 text-sm py-4">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading payout status...
      </div>
    );
  }

  const status = info?.stripe_connect_status ?? 'not_started';
  const config = STATUS_CONFIG[status];
  const StatusIcon = config.icon;

  return (
    <div className="space-y-4">
      {/* Status Badge */}
      <div className="flex items-center gap-3">
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.color}`}>
          <StatusIcon className="w-3.5 h-3.5" />
          {config.label}
        </span>
        {info?.stripe_payouts_enabled && (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
            <CheckCircle className="w-3.5 h-3.5" />
            Payouts enabled
          </span>
        )}
      </div>

      {/* Description */}
      <p className="text-sm text-stone-600">{config.description}</p>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* Actions */}
      <div className="flex items-center gap-3">
        {(status === 'not_started' || status === 'onboarding') && (
          <button
            onClick={handleSetup}
            disabled={actionLoading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {actionLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ExternalLink className="w-4 h-4" />
            )}
            {status === 'not_started' ? 'Set Up Payouts' : 'Continue Setup'}
          </button>
        )}
        {(status === 'restricted' || status === 'disabled') && (
          <button
            onClick={handleSetup}
            disabled={actionLoading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors disabled:opacity-50"
          >
            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
            Update Information
          </button>
        )}
        {status === 'active' && (
          <button
            onClick={handleUpdate}
            disabled={actionLoading}
            className="inline-flex items-center gap-2 px-4 py-2 border border-stone-200 text-stone-700 rounded-lg text-sm font-medium hover:bg-stone-50 transition-colors disabled:opacity-50"
          >
            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
            Update Banking Info
          </button>
        )}
      </div>
    </div>
  );
}
