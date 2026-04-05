import React, { useState } from 'react';
import { DollarSign } from 'lucide-react';
import type { Inquiry } from '../../types';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { API_BASE } from '../../config';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '../ui/alert-dialog';

interface SendOfferFormProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly inquiryId: number;
  readonly onSuccess?: (inquiry: Inquiry) => void;
}

export default function SendOfferForm({
  open,
  onOpenChange,
  inquiryId,
  onSuccess,
}: SendOfferFormProps) {
  const { token } = useAuth();
  const [priceStr, setPriceStr] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const price = parseFloat(priceStr);
    if (isNaN(price) || price < 1) {
      setError('Minimum offer is $1.00');
      return;
    }
    if (!date || !startTime || !endTime) {
      setError('Please fill in date and time');
      return;
    }

    const offerStartTime = new Date(`${date}T${startTime}`).toISOString();
    const offerEndTime = new Date(`${date}T${endTime}`).toISOString();

    if (new Date(offerEndTime) <= new Date(offerStartTime)) {
      setError('End time must be after start time');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/inquiries/${inquiryId}/offer`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offer_price_cents: Math.round(price * 100),
          offer_start_time: offerStartTime,
          offer_end_time: offerEndTime,
          offer_notes: notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to send offer');
        return;
      }

      const data = await res.json();
      onSuccess?.(data.inquiry);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = (v: boolean) => {
    if (!loading) {
      onOpenChange(v);
      if (!v) {
        setPriceStr('');
        setDate('');
        setStartTime('');
        setEndTime('');
        setNotes('');
        setError(null);
      }
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleClose}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-emerald-600" />
            Send Booking Offer
          </AlertDialogTitle>
          <AlertDialogDescription>
            Create a custom offer for this owner. They can accept to create a booking.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 mt-2">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Price ($)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={priceStr}
              onChange={(e) => setPriceStr(e.target.value)}
              placeholder="25.00"
              className="w-full p-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full p-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Start</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full p-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">End</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full p-2.5 border border-stone-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any special details about the offer..."
              className="w-full p-2.5 border border-stone-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
              rows={2}
              maxLength={1000}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 p-2 rounded-lg">{error}</p>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
          <button
            onClick={handleSubmit}
            disabled={loading || !priceStr || !date || !startTime || !endTime}
            className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Sending...' : 'Send Offer'}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
