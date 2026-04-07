import React, { useState, useEffect } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { Crown, Check, Zap, Shield, Clock, AlertCircle, CreditCard, Star, TrendingUp, Eye, Gift } from 'lucide-react';
import SubscriptionPaymentForm from '../../components/payment/SubscriptionPaymentForm';
import { API_BASE } from '../../config';
import type { SitterSubscription, SubscriptionTier } from '../../types';
import { formatCents } from '../../lib/money';
import { Button } from '../../components/ui/button';
import { Alert, AlertDescription } from '../../components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';

interface TierConfig {
  name: string;
  price: string;
  description: string;
  features: { icon: React.ElementType; text: string }[];
  gradient: string;
  border: string;
  badge?: string;
  badgeColor?: string;
  iconColor: string;
}

const TIERS: Record<SubscriptionTier, TierConfig> = {
  free: {
    name: 'Free',
    price: '$0',
    description: 'Basic sitter tools',
    features: [
      { icon: Check, text: 'Create services & accept bookings' },
      { icon: Check, text: 'Messaging with owners' },
      { icon: Check, text: 'Standard 3-day payouts' },
      { icon: Check, text: '15% platform fee per booking' },
    ],
    gradient: 'bg-white',
    border: 'border-stone-200',
    iconColor: 'text-stone-400',
  },
  pro: {
    name: 'Pro',
    price: '$19.99',
    description: 'Everything in Free, plus:',
    features: [
      { icon: Zap, text: '0% platform fee on all bookings' },
      { icon: Shield, text: 'Verified Pro badge on profile' },
      { icon: TrendingUp, text: 'Priority placement in search' },
      { icon: Clock, text: 'Faster 1-day payouts' },
      { icon: Eye, text: 'Advanced analytics & insights' },
    ],
    gradient: 'bg-gradient-to-br from-amber-50 to-amber-100',
    border: 'border-amber-300 border-2',
    badge: 'Recommended',
    badgeColor: 'bg-amber-500',
    iconColor: 'text-amber-600',
  },
  premium: {
    name: 'Premium',
    price: '$39.99',
    description: 'Everything in Pro, plus:',
    features: [
      { icon: Star, text: 'Featured listing in search results' },
      { icon: TrendingUp, text: 'Promoted with search boost' },
      { icon: Crown, text: 'Premium badge on profile' },
      { icon: Eye, text: 'Booking insights & recommendations' },
    ],
    gradient: 'bg-gradient-to-br from-violet-50 to-violet-100',
    border: 'border-violet-300 border-2',
    badge: 'Best Value',
    badgeColor: 'bg-violet-500',
    iconColor: 'text-violet-600',
  },
};

const TIER_ORDER: Record<SubscriptionTier, number> = { free: 0, pro: 1, premium: 2 };

export default function SubscriptionPage({ embedded = false }: { embedded?: boolean }) {
  const { user, token, loading: authLoading } = useAuth();
  const [subscription, setSubscription] = useState<SitterSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [subscriptionClientSecret, setSubscriptionClientSecret] = useState<string | null>(null);
  const [upgradeTier, setUpgradeTier] = useState<'pro' | 'premium'>('pro');
  const [searchParams, setSearchParams] = useSearchParams();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [creditBalance, setCreditBalance] = useState(0);

  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      setSuccessMessage('Your subscription is now active!');
      setSearchParams({}, { replace: true });
    }
    if (searchParams.get('cancelled') === 'true') {
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!user) return;
    fetchSubscription();
    fetchCreditBalance();
  }, [user]);

  const fetchCreditBalance = async () => {
    try {
      const res = await fetch(`${API_BASE}/credits/balance`, { headers: getAuthHeaders(token) });
      if (res.ok) {
        const data = await res.json();
        setCreditBalance(data.balance_cents);
      }
    } catch {
      // Non-critical
    }
  };

  const fetchSubscription = async () => {
    try {
      const res = await fetch(`${API_BASE}/subscription`, { headers: getAuthHeaders(token) });
      if (res.ok) {
        const data = await res.json();
        setSubscription(data.subscription);
      }
    } catch {
      setError('Failed to load subscription.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async (tier: 'pro' | 'premium') => {
    setActionLoading(true);
    setError(null);
    setUpgradeTier(tier);
    try {
      const intentRes = await fetch(`${API_BASE}/subscription/create-intent`, {
        method: 'POST',
        headers: { ...getAuthHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      });
      if (intentRes.ok) {
        const data = await intentRes.json();
        if (data.pending) {
          setSuccessMessage(`Upgrading to ${TIERS[tier].name} — your subscription will update shortly.`);
          fetchSubscription();
          setActionLoading(false);
          return;
        }
        setSubscriptionClientSecret(data.clientSecret);
        setShowPayment(true);
        setActionLoading(false);
        return;
      }

      const res = await fetch(`${API_BASE}/subscription/upgrade`, {
        method: 'POST',
        headers: { ...getAuthHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to upgrade');
      }
      const data = await res.json();
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
        return;
      }
      fetchSubscription();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upgrade');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDowngrade = async (tier: 'free' | 'pro') => {
    setActionLoading(true);
    setError(null);
    try {
      const endpoint = tier === 'free' ? '/subscription/cancel' : '/subscription/downgrade';
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { ...getAuthHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to change subscription');
      }
      setShowCancelDialog(false);
      fetchSubscription();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change subscription');
    } finally {
      setActionLoading(false);
    }
  };

  if (!embedded) {
    if (authLoading) return <div className="flex justify-center py-12" role="status" aria-live="polite"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600" /><span className="sr-only">Loading...</span></div>;
    if (!user) return <Navigate to="/login" replace />;
  }

  const currentTier: SubscriptionTier = (subscription?.status === 'active' ? subscription?.tier : 'free') || 'free';
  const currentOrder = TIER_ORDER[currentTier];
  const periodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div className={embedded ? '' : 'max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8'}>
      {!embedded && (
        <div className="flex items-center gap-3 mb-6">
          <Crown className={`w-6 h-6 ${currentTier !== 'free' ? 'text-amber-500' : 'text-stone-400'}`} />
          <h1 className="text-2xl font-bold text-stone-900">Subscription</h1>
        </div>
      )}

      {successMessage && (
        <Alert className="mb-4 border-emerald-200 bg-emerald-50">
          <AlertDescription className="flex items-center justify-between text-emerald-800">
            <span>{successMessage}</span>
            <button onClick={() => setSuccessMessage(null)} aria-label="Dismiss success message" className="text-xs font-medium hover:underline">Dismiss</button>
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} aria-label="Dismiss error" className="text-xs font-medium hover:underline">Dismiss</button>
          </AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex justify-center py-12" role="status" aria-live="polite"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600" /><span className="sr-only">Loading subscription...</span></div>
      ) : (
        <div className="space-y-6">
          {/* Credit Balance Widget */}
          {creditBalance > 0 && (
            <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Gift className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-emerald-800">Platform Credits</p>
                  <p className="text-xs text-emerald-600">Auto-applied to subscription renewals</p>
                </div>
              </div>
              <div className="text-xl font-bold text-emerald-700">{formatCents(creditBalance)}</div>
            </div>
          )}

          {/* Founding Sitter Badge */}
          {user?.founding_sitter && (
            <div className="bg-emerald-50 rounded-xl p-3 border border-emerald-100 flex items-center gap-2">
              <Star className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-semibold text-emerald-800">Founding Sitter</span>
              <span className="text-xs text-emerald-600 ml-1">Permanent badge for early supporters</span>
            </div>
          )}

          {/* 3-tier comparison */}
          <div className="grid md:grid-cols-3 gap-4">
            {(['free', 'pro', 'premium'] as SubscriptionTier[]).map((tier) => {
              const config = TIERS[tier];
              const tierOrder = TIER_ORDER[tier];
              const isCurrent = tier === currentTier;
              const isUpgrade = tierOrder > currentOrder;
              const isDowngrade = tierOrder < currentOrder;

              return (
                <div key={tier} className={`${config.gradient} ${config.border} rounded-2xl p-6 relative`}>
                  {config.badge && (
                    <div className={`absolute -top-3 right-4 ${config.badgeColor} text-white text-xs font-bold px-3 py-1 rounded-full`}>
                      {config.badge}
                    </div>
                  )}
                  <h3 className={`text-sm font-bold ${tier === 'premium' ? 'text-violet-700' : tier === 'pro' ? 'text-amber-700' : 'text-stone-500'} mb-1`}>
                    {config.name}
                  </h3>
                  <p className="text-2xl font-bold text-stone-900 mb-4">
                    {config.price}<span className="text-sm font-normal text-stone-400">/month</span>
                  </p>
                  <p className="text-sm text-stone-600 mb-4">{config.description}</p>
                  <ul className="space-y-2 text-sm text-stone-700">
                    {config.features.map((f) => (
                      <li key={f.text} className="flex items-center gap-2">
                        <f.icon className={`w-4 h-4 ${config.iconColor}`} /> {f.text}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-6">
                    {isCurrent && (
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full">Current Plan</span>
                        {tier !== 'free' && (
                          <button
                            onClick={() => setShowCancelDialog(true)}
                            className="text-xs text-stone-400 hover:text-stone-600"
                          >
                            Cancel
                          </button>
                        )}
                      </div>
                    )}
                    {isUpgrade && (
                      <Button
                        onClick={() => handleUpgrade(tier as 'pro' | 'premium')}
                        disabled={actionLoading}
                        className={`w-full ${tier === 'premium' ? 'bg-violet-500 hover:bg-violet-600' : 'bg-amber-500 hover:bg-amber-600'}`}
                      >
                        <Crown className="w-4 h-4" />
                        {actionLoading ? 'Processing...' : `Upgrade to ${config.name}`}
                      </Button>
                    )}
                    {isDowngrade && tier !== 'free' && (
                      <Button
                        variant="outline"
                        onClick={() => handleDowngrade(tier as 'free' | 'pro')}
                        disabled={actionLoading}
                        className="w-full"
                      >
                        Downgrade to {config.name}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Period info */}
          {currentTier !== 'free' && periodEnd && (
            <p className="text-sm text-stone-500 text-center">
              Current period ends <span className="font-medium">{periodEnd}</span>
            </p>
          )}

          {/* Info note */}
          <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-stone-400 mt-0.5 shrink-0" />
            <p className="text-sm text-stone-600">Payments are processed securely via Stripe. Upgrade or downgrade anytime — prorated billing applies.</p>
          </div>
        </div>
      )}

      {/* Cancel dialog */}
      <AlertDialog open={showCancelDialog} onOpenChange={(open) => { if (!open) setShowCancelDialog(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Subscription</AlertDialogTitle>
            <AlertDialogDescription>
              You'll lose access to {TIERS[currentTier].name} benefits. Are you sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep {TIERS[currentTier].name}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => handleDowngrade('free')}>
              {actionLoading ? 'Cancelling...' : 'Cancel Subscription'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Payment dialog */}
      <AlertDialog open={showPayment} onOpenChange={(open) => { if (!open) { setShowPayment(false); setSubscriptionClientSecret(null); } }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-emerald-600" />
              Subscribe to {TIERS[upgradeTier].name}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {TIERS[upgradeTier].price}/month — payment processed securely.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {subscriptionClientSecret && (
            <SubscriptionPaymentForm
              clientSecret={subscriptionClientSecret}
              onSuccess={() => {
                setShowPayment(false);
                setSubscriptionClientSecret(null);
                setSuccessMessage(`Welcome to ${TIERS[upgradeTier].name}! Your subscription is now active.`);
                fetchSubscription();
              }}
              onError={(msg) => setError(msg)}
            />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setShowPayment(false); setSubscriptionClientSecret(null); }}>
              Cancel
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
