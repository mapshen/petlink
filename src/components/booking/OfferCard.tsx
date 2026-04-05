import React, { useState, useMemo } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { DollarSign, Calendar, Clock, Check, X, Timer } from 'lucide-react';
import type { Inquiry } from '../../types';
import { formatCents } from '../../lib/money';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { API_BASE } from '../../config';

interface OfferCardProps {
  readonly inquiry: Inquiry;
  readonly isOwner: boolean;
  readonly onUpdate?: (inquiry: Inquiry) => void;
}

export default function OfferCard({ inquiry, isOwner, onUpdate }: OfferCardProps) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAction = async (action: 'accept' | 'decline') => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/inquiries/${inquiry.id}/${action}`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(token), 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || `Failed to ${action}`);
        return;
      }

      const data = await res.json();
      onUpdate?.(data.inquiry);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const expiresAt = useMemo(() => {
    if (!inquiry.offer_sent_at) return null;
    return new Date(new Date(inquiry.offer_sent_at).getTime() + 48 * 60 * 60 * 1000);
  }, [inquiry.offer_sent_at]);

  if (inquiry.status !== 'offer_sent' || !inquiry.offer_price_cents) {
    return null;
  }

  return (
    <div className="mx-auto max-w-sm bg-white border border-emerald-200 rounded-2xl p-4 shadow-sm">
      <div className="text-center mb-3">
        <span className="inline-block bg-emerald-100 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full">
          Booking Offer
        </span>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2 text-stone-700">
          <DollarSign className="w-4 h-4 text-emerald-600" />
          <span className="font-semibold">{formatCents(inquiry.offer_price_cents)}</span>
        </div>
        {inquiry.offer_start_time && (
          <div className="flex items-center gap-2 text-stone-700">
            <Calendar className="w-4 h-4 text-emerald-600" />
            <span>{format(new Date(inquiry.offer_start_time), 'MMMM d, yyyy')}</span>
          </div>
        )}
        {inquiry.offer_start_time && inquiry.offer_end_time && (
          <div className="flex items-center gap-2 text-stone-700">
            <Clock className="w-4 h-4 text-emerald-600" />
            <span>
              {format(new Date(inquiry.offer_start_time), 'h:mm a')} &ndash; {format(new Date(inquiry.offer_end_time), 'h:mm a')}
            </span>
          </div>
        )}
        {inquiry.offer_notes && (
          <p className="text-stone-500 text-xs mt-1 italic">&ldquo;{inquiry.offer_notes}&rdquo;</p>
        )}
      </div>

      {expiresAt && expiresAt.getTime() > Date.now() && (
        <div className="flex items-center gap-1.5 mt-2 text-xs text-amber-600">
          <Timer className="w-3.5 h-3.5" />
          <span>Expires {formatDistanceToNow(expiresAt, { addSuffix: true })}</span>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600 mt-2">{error}</p>
      )}

      {isOwner && (
        <div className="flex gap-2 mt-4">
          <button
            onClick={() => handleAction('accept')}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600 text-white py-2 rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
            Accept
          </button>
          <button
            onClick={() => handleAction('decline')}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-1.5 border border-stone-300 text-stone-600 py-2 rounded-xl text-sm font-medium hover:bg-stone-50 transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
            Decline
          </button>
        </div>
      )}

      {!isOwner && (
        <p className="text-xs text-center text-stone-400 mt-3">Waiting for the owner to respond...</p>
      )}
    </div>
  );
}
