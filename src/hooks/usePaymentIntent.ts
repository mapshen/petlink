import { useState, useCallback } from 'react';
import { useAuth, getAuthHeaders } from '../context/AuthContext';
import { API_BASE } from '../config';

interface UsePaymentIntentReturn {
  clientSecret: string | null;
  loading: boolean;
  error: string | null;
  createIntent: (bookingId: number) => Promise<string | null>;
}

export function usePaymentIntent(): UsePaymentIntentReturn {
  const { token } = useAuth();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createIntent = useCallback(async (bookingId: number): Promise<string | null> => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/payments/create-intent`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify({ booking_id: bookingId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create payment');
      }

      const data = await res.json();
      setClientSecret(data.clientSecret);
      return data.clientSecret;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Payment setup failed';
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }, [token]);

  return { clientSecret, loading, error, createIntent };
}
