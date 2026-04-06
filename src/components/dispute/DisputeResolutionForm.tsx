import React, { useState } from 'react';
import type { DisputeResolutionType } from '../../types';
import { getAuthHeaders } from '../../context/AuthContext';
import { API_BASE } from '../../config';
import { CheckCircle, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Input } from '../ui/input';
import { Alert, AlertDescription } from '../ui/alert';
import { getResolutionLabel } from '../../shared/dispute-labels';
import { formatCents } from '../../lib/money';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';

const RESOLUTION_OPTIONS: { value: DisputeResolutionType; label: string; needsAmount: boolean }[] = [
  { value: 'full_refund', label: 'Full Refund', needsAmount: false },
  { value: 'partial_refund', label: 'Partial Refund', needsAmount: true },
  { value: 'credit', label: 'Account Credit (manual)', needsAmount: false },
  { value: 'warning_owner', label: 'Warning to Owner', needsAmount: false },
  { value: 'warning_sitter', label: 'Warning to Sitter', needsAmount: false },
  { value: 'ban_owner', label: 'Ban Owner', needsAmount: false },
  { value: 'ban_sitter', label: 'Ban Sitter', needsAmount: false },
  { value: 'no_action', label: 'No Action', needsAmount: false },
];

interface Props {
  readonly disputeId: number;
  readonly bookingTotal: number;
  readonly token: string | null;
  readonly onResolved: () => void;
}

export default function DisputeResolutionForm({ disputeId, bookingTotal, token, onResolved }: Props) {
  const [resolutionType, setResolutionType] = useState<DisputeResolutionType | ''>('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const selectedOption = RESOLUTION_OPTIONS.find((o) => o.value === resolutionType);
  const amountCents = amount ? Math.round(parseFloat(amount) * 100) : 0;
  const isRefund = resolutionType === 'full_refund' || resolutionType === 'partial_refund';
  const isBan = resolutionType === 'ban_owner' || resolutionType === 'ban_sitter';

  const handleSubmit = async () => {
    setConfirmOpen(false);
    setSubmitting(true);
    setError(null);

    try {
      const body: Record<string, unknown> = {
        resolution_type: resolutionType,
        resolution_notes: notes.trim(),
      };
      if (resolutionType === 'partial_refund') {
        body.resolution_amount_cents = amountCents;
      }

      const res = await fetch(`${API_BASE}/disputes/${disputeId}/resolve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders(token) },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to resolve dispute');
      }

      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve dispute');
    } finally {
      setSubmitting(false);
    }
  };

  const validate = (): string | null => {
    if (!resolutionType) return 'Select a resolution type';
    if (!notes.trim()) return 'Resolution notes are required';
    if (resolutionType === 'partial_refund') {
      if (isNaN(amountCents) || amountCents <= 0) return 'Enter a valid refund amount';
      if (amountCents > bookingTotal) return `Amount cannot exceed ${formatCents(bookingTotal)}`;
    }
    return null;
  };

  const handleResolveClick = () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setConfirmOpen(true);
  };

  const confirmLabel = isRefund
    ? `Resolve & Refund ${resolutionType === 'full_refund' ? formatCents(bookingTotal) : `$${amount}`}`
    : isBan
      ? `Resolve & Ban ${resolutionType === 'ban_owner' ? 'Owner' : 'Sitter'}`
      : 'Resolve Dispute';

  return (
    <div className="bg-white rounded-2xl border border-purple-200 overflow-hidden">
      <div className="bg-purple-50 px-4 py-3 border-b border-purple-100">
        <h3 className="text-sm font-bold text-purple-900 flex items-center gap-2">
          <CheckCircle className="w-4 h-4" />
          Resolve Dispute
        </h3>
      </div>

      <div className="p-4 space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Booking context */}
        <div className="bg-stone-50 rounded-xl p-3 text-xs flex justify-between">
          <span className="text-stone-500">Booking Total</span>
          <span className="font-medium text-stone-800">{formatCents(bookingTotal)}</span>
        </div>

        {/* Resolution type */}
        <div>
          <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">Resolution</label>
          <select
            value={resolutionType}
            onChange={(e) => { setResolutionType(e.target.value as DisputeResolutionType); setError(null); }}
            className="w-full text-sm border border-stone-200 rounded-xl px-3 py-2 text-stone-800 bg-white"
          >
            <option value="">Select resolution...</option>
            {RESOLUTION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}{opt.value === 'full_refund' ? ` (${formatCents(bookingTotal)})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Partial refund amount */}
        {selectedOption?.needsAmount && (
          <div className="bg-amber-50 rounded-xl p-3 space-y-2">
            <label className="block text-xs font-bold text-amber-700 uppercase tracking-wider">Refund Amount</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-stone-500">$</span>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                max={(bookingTotal / 100).toFixed(2)}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-32 text-sm text-right"
              />
              <span className="text-xs text-stone-400">of {formatCents(bookingTotal)}</span>
            </div>
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">
            Resolution Notes <span className="text-red-500">*</span>
          </label>
          <Textarea
            rows={3}
            placeholder="Explain the resolution decision..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
          />
        </div>

        {/* Action */}
        <Button
          className={`w-full ${isBan ? 'bg-red-600 hover:bg-red-700' : 'bg-purple-600 hover:bg-purple-700'} text-white`}
          onClick={handleResolveClick}
          disabled={submitting}
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          {confirmLabel}
        </Button>
      </div>

      {/* Confirmation dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Resolution</AlertDialogTitle>
            <AlertDialogDescription>
              {isRefund && `This will process a ${resolutionType === 'full_refund' ? 'full' : 'partial'} refund via Stripe. `}
              {isBan && `This will ban the ${resolutionType === 'ban_owner' ? 'owner' : 'sitter'} from the platform. `}
              Both parties will be notified. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSubmit}
              className={isBan ? 'bg-red-600 hover:bg-red-700' : 'bg-purple-600 hover:bg-purple-700'}
            >
              {confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
