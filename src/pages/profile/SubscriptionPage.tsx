import React, { useState, useEffect } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { Crown, Check, Zap, Shield, Clock, AlertCircle, CreditCard } from 'lucide-react';
import SubscriptionPaymentForm from '../../components/payment/SubscriptionPaymentForm';
import { API_BASE } from '../../config';
import { SitterSubscription } from '../../types';
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

const PRO_BENEFITS = [
  { icon: Zap, text: 'Priority placement in search results' },
  { icon: Shield, text: 'Pro badge on your profile' },
  { icon: Clock, text: 'Faster payout processing (1 day vs 3 days)' },
  { icon: Check, text: 'Advanced analytics and insights' },
];

export default function SubscriptionPage({ embedded = false }: { embedded?: boolean }) {
  const { user, token, loading: authLoading } = useAuth();
  const [subscription, setSubscription] = useState<SitterSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [subscriptionClientSecret, setSubscriptionClientSecret] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      setSuccessMessage('Welcome to Pro! Your subscription is now active.');
      setSearchParams({}, { replace: true });
    }
    if (searchParams.get('cancelled') === 'true') {
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!user) return;
    fetchSubscription();
  }, [user]);

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

  const handleUpgrade = async () => {
    setActionLoading(true);
    setError(null);
    try {
      // Try embedded payment first
      const intentRes = await fetch(`${API_BASE}/subscription/create-intent`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify({}),
      });
      if (intentRes.ok) {
        const intentData = await intentRes.json();
        setSubscriptionClientSecret(intentData.clientSecret);
        setShowPayment(true);
        setActionLoading(false);
        return;
      }

      // Fallback to hosted checkout / dev mode
      const res = await fetch(`${API_BASE}/subscription/upgrade`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify({}),
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

  const handleCancel = async () => {
    setActionLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/subscription/cancel`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to cancel');
      }
      setShowCancelDialog(false);
      fetchSubscription();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel');
    } finally {
      setActionLoading(false);
    }
  };

  if (!embedded) {
    if (authLoading) return <div className="flex justify-center py-12" role="status" aria-live="polite"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div><span className="sr-only">Loading...</span></div>;
    if (!user) return <Navigate to="/login" replace />;
  }

  const isPro = subscription?.tier === 'pro' && subscription?.status === 'active';
  const periodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  return (
    <div className={embedded ? '' : 'max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8'}>
      {!embedded && (
        <div className="flex items-center gap-3 mb-6">
          <Crown className={`w-6 h-6 ${isPro ? 'text-amber-500' : 'text-stone-400'}`} />
          <h1 className="text-2xl font-bold text-stone-900">Subscription</h1>
        </div>
      )}

      {successMessage && (
        <Alert className="mb-4 border-emerald-200 bg-emerald-50">
          <AlertDescription className="flex items-center justify-between text-emerald-800">
            <span>{successMessage}</span>
            <button onClick={() => setSuccessMessage(null)} aria-label="Dismiss message" className="text-xs font-medium hover:underline">Dismiss</button>
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
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div></div>
      ) : isPro ? (
        <div className="space-y-6">
          {/* Active Pro Card */}
          <div className="bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="bg-amber-500 p-2 rounded-xl">
                  <Crown className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-stone-900">PetLink Pro</h2>
                  <span className="text-xs font-medium text-amber-700 bg-amber-200 px-2 py-0.5 rounded-full">Active</span>
                </div>
              </div>
            </div>
            {periodEnd && (
              <p className="text-sm text-stone-600 mb-4">
                Current period ends <span className="font-medium">{periodEnd}</span>
              </p>
            )}
            <div className="space-y-2 mb-6">
              {PRO_BENEFITS.map((benefit) => (
                <div key={benefit.text} className="flex items-center gap-2">
                  <benefit.icon className="w-4 h-4 text-amber-600" />
                  <span className="text-sm text-stone-700">{benefit.text}</span>
                </div>
              ))}
            </div>
            <Button variant="outline" onClick={() => setShowCancelDialog(true)} disabled={actionLoading}>
              Cancel Subscription
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Free vs Pro Comparison */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Free Tier */}
            <div className="bg-white border border-stone-200 rounded-2xl p-6">
              <h3 className="text-sm font-bold text-stone-500 mb-1">Free</h3>
              <p className="text-2xl font-bold text-stone-900 mb-4">$0<span className="text-sm font-normal text-stone-400">/month</span></p>
              <p className="text-sm text-stone-500 mb-4">Basic sitter tools</p>
              <ul className="space-y-2 text-sm text-stone-600">
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-stone-400" /> Create services</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-stone-400" /> Accept bookings</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-stone-400" /> Messaging</li>
                <li className="flex items-center gap-2"><Check className="w-4 h-4 text-stone-400" /> Standard 3-day payouts</li>
              </ul>
              <div className="mt-6">
                <span className="text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-1 rounded-full">Current Plan</span>
              </div>
            </div>

            {/* Pro Tier */}
            <div className="bg-gradient-to-br from-amber-50 to-amber-100 border-2 border-amber-300 rounded-2xl p-6 relative">
              <div className="absolute -top-3 right-4 bg-amber-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                Recommended
              </div>
              <h3 className="text-sm font-bold text-amber-700 mb-1">Pro</h3>
              <p className="text-2xl font-bold text-stone-900 mb-4">$19.99<span className="text-sm font-normal text-stone-400">/month</span></p>
              <p className="text-sm text-stone-600 mb-4">Everything in Free, plus:</p>
              <ul className="space-y-2 text-sm text-stone-700">
                {PRO_BENEFITS.map((benefit) => (
                  <li key={benefit.text} className="flex items-center gap-2">
                    <benefit.icon className="w-4 h-4 text-amber-600" /> {benefit.text}
                  </li>
                ))}
              </ul>
              <div className="mt-6">
                <Button onClick={handleUpgrade} disabled={actionLoading} className="w-full bg-amber-500 hover:bg-amber-600">
                  <Crown className="w-4 h-4" /> {actionLoading ? 'Upgrading...' : 'Upgrade to Pro'}
                </Button>
              </div>
            </div>
          </div>

          {/* Info note */}
          <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-stone-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm text-stone-600">You'll be redirected to Stripe to complete payment. Cancel anytime from this page.</p>
            </div>
          </div>
        </div>
      )}

      <AlertDialog open={showCancelDialog} onOpenChange={(open) => { if (!open) setShowCancelDialog(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Pro Subscription</AlertDialogTitle>
            <AlertDialogDescription>
              You'll lose access to Pro benefits at the end of your current billing period. Are you sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Pro</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleCancel}>
              {actionLoading ? 'Cancelling...' : 'Cancel Subscription'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Embedded Subscription Payment */}
      <AlertDialog open={showPayment} onOpenChange={(open) => { if (!open) { setShowPayment(false); setSubscriptionClientSecret(null); } }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-emerald-600" />
              Subscribe to Pro
            </AlertDialogTitle>
            <AlertDialogDescription>
              Payment is processed securely on this page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {subscriptionClientSecret && (
            <SubscriptionPaymentForm
              clientSecret={subscriptionClientSecret}
              onSuccess={() => {
                setShowPayment(false);
                setSubscriptionClientSecret(null);
                setSuccessMessage('Welcome to Pro! Your subscription is now active.');
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
