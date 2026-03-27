import { describe, it, expect, vi, beforeEach } from 'vitest';

// Test the createPaymentIntent API call logic as a pure function
interface PaymentIntentResult {
  clientSecret: string | null;
  error: string | null;
}

async function fetchPaymentIntent(
  bookingId: number,
  fetchFn: typeof fetch,
  token: string | null
): Promise<PaymentIntentResult> {
  try {
    const res = await fetchFn('/api/v1/payments/create-intent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ booking_id: bookingId }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { clientSecret: null, error: data.error || 'Payment failed' };
    }

    const data = await res.json();
    return { clientSecret: data.clientSecret, error: null };
  } catch {
    return { clientSecret: null, error: 'Network error' };
  }
}

describe('fetchPaymentIntent', () => {
  it('returns clientSecret on success', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ clientSecret: 'pi_secret_123' }),
    });

    const result = await fetchPaymentIntent(1, mockFetch, 'token123');
    expect(result).toEqual({ clientSecret: 'pi_secret_123', error: null });
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/payments/create-intent', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ booking_id: 1 }),
    }));
  });

  it('returns error on API failure', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Payment already initiated' }),
    });

    const result = await fetchPaymentIntent(1, mockFetch, 'token123');
    expect(result).toEqual({ clientSecret: null, error: 'Payment already initiated' });
  });

  it('returns error on network failure', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await fetchPaymentIntent(1, mockFetch, 'token123');
    expect(result).toEqual({ clientSecret: null, error: 'Network error' });
  });

  it('includes auth header when token provided', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ clientSecret: 'pi_secret_123' }),
    });

    await fetchPaymentIntent(1, mockFetch, 'mytoken');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer mytoken' }),
      })
    );
  });

  it('handles empty response gracefully', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.reject(new Error('No JSON')),
    });

    const result = await fetchPaymentIntent(1, mockFetch, 'token');
    expect(result).toEqual({ clientSecret: null, error: 'Payment failed' });
  });
});
