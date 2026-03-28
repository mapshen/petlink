import { useState } from 'react';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import type { StripeElementsOptions } from '@stripe/stripe-js';
import { stripePromise } from '../stripe';
import { Loader2, Lock, Crown } from 'lucide-react';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';

interface SubscriptionPaymentFormProps {
  clientSecret: string;
  onSuccess: () => void;
  onError: (message: string) => void;
}

function SubscriptionCheckout({ onSuccess, onError }: Omit<SubscriptionPaymentFormProps, 'clientSecret'>) {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    setError(null);

    const { error: submitError } = await elements.submit();
    if (submitError) {
      setError(submitError.message ?? 'Validation failed');
      setProcessing(false);
      return;
    }

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    });

    if (confirmError) {
      const msg = confirmError.message ?? 'Payment failed';
      setError(msg);
      onError(msg);
    } else {
      onSuccess();
    }

    setProcessing(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 text-center">
        <Crown className="w-6 h-6 text-emerald-600 mx-auto mb-2" />
        <p className="text-lg font-bold text-stone-900">$19.99<span className="text-sm font-normal text-stone-500">/month</span></p>
        <p className="text-xs text-stone-500 mt-1">Pro Membership</p>
      </div>

      <PaymentElement />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={!stripe || processing} className="w-full" size="lg">
        {processing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Lock className="w-4 h-4 mr-2" />}
        {processing ? 'Processing...' : 'Subscribe — $19.99/mo'}
      </Button>

      <p className="text-xs text-stone-400 text-center flex items-center justify-center gap-1">
        <Lock className="w-3 h-3" /> Secured by Stripe. Cancel anytime.
      </p>
    </form>
  );
}

export default function SubscriptionPaymentForm({ clientSecret, onSuccess, onError }: SubscriptionPaymentFormProps) {
  if (!stripePromise) {
    return (
      <Alert>
        <AlertDescription>Payment is not configured.</AlertDescription>
      </Alert>
    );
  }

  const options: StripeElementsOptions = {
    clientSecret,
    appearance: {
      theme: 'stripe',
      variables: {
        colorPrimary: '#059669',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      },
    },
  };

  return (
    <Elements stripe={stripePromise} options={options}>
      <SubscriptionCheckout onSuccess={onSuccess} onError={onError} />
    </Elements>
  );
}
