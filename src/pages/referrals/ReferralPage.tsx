import React, { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { Users, Gift, Copy, Check, Share2, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { API_BASE } from '../../config';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { formatCents } from '../../lib/money';

interface ReferralStats {
  readonly referral_code: string;
  readonly total_referrals: number;
  readonly pending_referrals: number;
  readonly completed_referrals: number;
  readonly total_earned_cents: number;
}

interface ReferralHistoryItem {
  readonly id: number;
  readonly referred_name: string;
  readonly referred_avatar: string | null;
  readonly status: 'pending' | 'completed' | 'expired';
  readonly created_at: string;
  readonly completed_at: string | null;
}

export default function ReferralPage() {
  const { user, token } = useAuth();
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [history, setHistory] = useState<ReferralHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [applyCode, setApplyCode] = useState('');
  const [applyError, setApplyError] = useState('');
  const [applySuccess, setApplySuccess] = useState('');
  const [applying, setApplying] = useState(false);

  if (!user) return <Navigate to="/login" replace />;

  const loadData = useCallback(async () => {
    try {
      const headers = getAuthHeaders(token);
      const [statsRes, historyRes] = await Promise.all([
        fetch(`${API_BASE}/referrals/stats`, { headers }),
        fetch(`${API_BASE}/referrals/history`, { headers }),
      ]);

      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data);
      }
      if (historyRes.ok) {
        const data = await historyRes.json();
        setHistory(data.referrals);
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCopy = useCallback(async () => {
    if (!stats?.referral_code) return;
    const shareUrl = `${window.location.origin}/login?ref=${stats.referral_code}`;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [stats]);

  const handleShare = useCallback(async () => {
    if (!stats?.referral_code) return;
    const shareUrl = `${window.location.origin}/login?ref=${stats.referral_code}`;
    if (navigator.share) {
      await navigator.share({
        title: 'Join PetLink!',
        text: `Use my referral code ${stats.referral_code} to get $5 credit on your first booking!`,
        url: shareUrl,
      }).catch(() => {});
    } else {
      await handleCopy();
    }
  }, [stats, handleCopy]);

  const handleApply = useCallback(async () => {
    if (!applyCode.trim()) return;
    setApplyError('');
    setApplySuccess('');
    setApplying(true);
    try {
      const res = await fetch(`${API_BASE}/referrals/apply`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify({ code: applyCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setApplyError(data.error || 'Failed to apply code');
      } else {
        setApplySuccess('Referral code applied! You\'ll earn $5 credit after your first booking.');
        setApplyCode('');
      }
    } catch {
      setApplyError('Something went wrong');
    } finally {
      setApplying(false);
    }
  }, [applyCode, token]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-stone-900">Refer a Friend</h1>
        <p className="text-stone-500 mt-1">
          Share your referral code and earn credits when friends join PetLink
        </p>
      </div>

      {/* Share Card */}
      <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-2xl p-6 border border-emerald-200">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-emerald-600 rounded-xl">
            <Gift className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-stone-900">Your Referral Code</h2>
            <p className="text-stone-600 text-sm mt-1">
              You earn <span className="font-semibold text-emerald-700">$10</span> and your friend gets{' '}
              <span className="font-semibold text-emerald-700">$5</span> when they complete their first booking
            </p>
            <div className="mt-4 flex items-center gap-3">
              <div className="bg-white rounded-lg px-4 py-2.5 font-mono text-lg font-bold text-emerald-700 tracking-wider border border-emerald-200">
                {stats?.referral_code || '--------'}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="gap-2"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied!' : 'Copy Link'}
              </Button>
              <Button
                size="sm"
                onClick={handleShare}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700"
              >
                <Share2 className="h-4 w-4" />
                Share
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Referrals"
          value={String(stats?.total_referrals ?? 0)}
          icon={<Users className="h-5 w-5 text-emerald-600" />}
        />
        <StatCard
          label="Pending"
          value={String(stats?.pending_referrals ?? 0)}
          icon={<Clock className="h-5 w-5 text-amber-500" />}
        />
        <StatCard
          label="Completed"
          value={String(stats?.completed_referrals ?? 0)}
          icon={<CheckCircle2 className="h-5 w-5 text-emerald-600" />}
        />
        <StatCard
          label="Credits Earned"
          value={formatCents(stats?.total_earned_cents ?? 0)}
          icon={<Gift className="h-5 w-5 text-emerald-600" />}
        />
      </div>

      {/* Apply a Code */}
      <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6">
        <h3 className="text-lg font-semibold text-stone-900 mb-2">Have a referral code?</h3>
        <p className="text-stone-500 text-sm mb-4">
          Enter a friend's referral code to earn $5 credit on your first booking
        </p>
        <div className="flex gap-3">
          <Input
            placeholder="Enter referral code"
            value={applyCode}
            onChange={(e) => setApplyCode(e.target.value)}
            className="max-w-xs font-mono uppercase"
            maxLength={20}
          />
          <Button
            onClick={handleApply}
            disabled={applying || !applyCode.trim()}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {applying ? 'Applying...' : 'Apply'}
          </Button>
        </div>
        {applyError && (
          <Alert variant="destructive" className="mt-3">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{applyError}</AlertDescription>
          </Alert>
        )}
        {applySuccess && (
          <Alert className="mt-3 border-emerald-200 bg-emerald-50">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <AlertDescription className="text-emerald-700">{applySuccess}</AlertDescription>
          </Alert>
        )}
      </div>

      {/* Referral History */}
      <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6">
        <h3 className="text-lg font-semibold text-stone-900 mb-4">Referral History</h3>
        {history.length === 0 ? (
          <div className="text-center py-8 text-stone-400">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No referrals yet. Share your code to get started!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between py-3 border-b border-stone-100 last:border-0"
              >
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-stone-100 flex items-center justify-center overflow-hidden">
                    {item.referred_avatar ? (
                      <img src={item.referred_avatar} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Users className="h-5 w-5 text-stone-400" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-stone-900">{item.referred_name}</p>
                    <p className="text-sm text-stone-500">
                      {new Date(item.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <StatusBadge status={item.status} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-sm text-stone-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-stone-900">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    pending: { label: 'Pending', className: 'bg-amber-100 text-amber-700' },
    completed: { label: 'Completed', className: 'bg-emerald-100 text-emerald-700' },
    expired: { label: 'Expired', className: 'bg-stone-100 text-stone-500' },
  };
  const { label, className } = config[status] ?? config.pending;
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}
