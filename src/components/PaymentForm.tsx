import { useState } from 'react';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import type { StripeElementsOptions } from '@stripe/stripe-js';
import { stripePromise } from '../stripe';
import { Loader2, Lock } from 'lucide-react';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';

interface PaymentFormProps {
  clientSecret: string;
  amount: number;
  onSuccess: () => void;
  onError: (message: string) => void;
}

function CheckoutForm({ amount, onSuccess, onError }: Omit<PaymentFormProps, 'clientSecret'>) {
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
      setError(submitError.message ?? 'Payment validation failed');
      setProcessing(false);
      return;
    }

    const { error: confirmError, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    });

    if (confirmError) {
      const msg = confirmError.message ?? 'Payment failed';
      setError(msg);
      onError(msg);
      setProcessing(false);
      return;
    }

    if (paymentIntent && (paymentIntent.status === 'succeeded' || paymentIntent.status === 'requires_capture')) {
      onSuccess();
    } else {
      const msg = 'Unexpected payment status';
      setError(msg);
      onError(msg);
    }

    setProcessing(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="p-4 bg-stone-50 rounded-xl border border-stone-200 text-center">
        <p className="text-sm text-stone-500">Total</p>
        <p className="text-2xl font-bold text-stone-900">${(amount / 100).toFixed(2)}</p>
      </div>

      <PaymentElement />

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        type="submit"
        disabled={!stripe || processing}
        className="w-full"
        size="lg"
      >
        {processing ? (
          <Loader2 className="w-4 h-4 animate-spin mr-2" />
        ) : (
          <Lock className="w-4 h-4 mr-2" />
        )}
        {processing ? 'Processing...' : `Pay $${(amount / 100).toFixed(2)}`}
      </Button>

      <p className="text-xs text-stone-400 text-center flex items-center justify-center gap-1">
        <Lock className="w-3 h-3" /> Secured by Stripe
      </p>
    </form>
  );
}

export default function PaymentForm({ clientSecret, amount, onSuccess, onError }: PaymentFormProps) {
  if (!stripePromise) {
    return (
      <Alert>
        <AlertDescription>Payment is not configured. Please try again later.</AlertDescription>
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
      <CheckoutForm amount={amount} onSuccess={onSuccess} onError={onError} />
    </Elements>
  );
}
