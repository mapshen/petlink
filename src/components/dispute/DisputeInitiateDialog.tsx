import React, { useState } from 'react';
import type { IncidentReport } from '../../types';
import { getAuthHeaders } from '../../context/AuthContext';
import { API_BASE } from '../../config';
import { Scale, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Alert, AlertDescription } from '../ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { getCategoryConfig } from '../incident/IncidentCard';
import { format } from 'date-fns';

interface Props {
  readonly bookingId: number;
  readonly token: string | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmitted: () => void;
  readonly bookingLabel?: string;
  readonly incidents?: IncidentReport[];
}

export default function DisputeInitiateDialog({ bookingId, token, open, onOpenChange, onSubmitted, bookingLabel, incidents }: Props) {
  const [incidentId, setIncidentId] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setIncidentId(null);
    setReason('');
    setError(null);
  };

  const handleSubmit = async () => {
    if (!reason.trim()) {
      setError('Please explain why you are filing this dispute');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE}/disputes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders(token) },
        body: JSON.stringify({
          booking_id: bookingId,
          incident_id: incidentId,
          reason: reason.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to file dispute');
      }

      resetForm();
      onOpenChange(false);
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to file dispute');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
              <Scale className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <DialogTitle className="text-base">Open a Dispute</DialogTitle>
              {bookingLabel && <p className="text-xs text-stone-400 mt-0.5">{bookingLabel}</p>}
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Incident link (optional) */}
          {incidents && incidents.length > 0 && (
            <div>
              <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">
                Related Incident <span className="text-stone-400 font-normal normal-case">(optional)</span>
              </label>
              <div className="space-y-2" role="radiogroup" aria-label="Related incident">
                {incidents.map((inc) => {
                  const cat = getCategoryConfig(inc.category);
                  return (
                    <label
                      key={inc.id}
                      className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                        incidentId === inc.id ? 'border-2 border-purple-300 bg-purple-50' : 'border border-stone-200 hover:bg-stone-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="incident"
                        role="radio"
                        aria-checked={incidentId === inc.id}
                        checked={incidentId === inc.id}
                        onChange={() => setIncidentId(inc.id)}
                        className="text-purple-600"
                      />
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-stone-800">
                          {cat.emoji} {cat.label} — {format(new Date(inc.created_at), 'MMM d')}
                        </span>
                        <span className="block text-xs text-stone-500 truncate">{inc.description}</span>
                      </div>
                    </label>
                  );
                })}
                <label
                  className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                    incidentId === null ? 'border-2 border-purple-300 bg-purple-50' : 'border border-stone-200 hover:bg-stone-50'
                  }`}
                >
                  <input
                    type="radio"
                    name="incident"
                    checked={incidentId === null}
                    onChange={() => setIncidentId(null)}
                    className="text-purple-600"
                  />
                  <span className="text-sm text-stone-500">No specific incident — general dispute</span>
                </label>
              </div>
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="block text-xs font-bold text-stone-500 uppercase tracking-wider mb-2">
              Why are you filing this dispute? <span className="text-red-500">*</span>
            </label>
            <Textarea
              rows={4}
              placeholder="Describe the issue and what resolution you're seeking..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={2000}
            />
            <div className="text-xs text-stone-400 text-right mt-1">{reason.length}/2000</div>
          </div>

          {/* Info */}
          <div className="bg-blue-50 rounded-xl px-4 py-3 flex items-start gap-2">
            <Scale className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-800">
              A PetLink mediator will review the dispute with both parties. All incident reports and messages for this booking will be included as evidence.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => { resetForm(); onOpenChange(false); }} disabled={submitting}>
              Cancel
            </Button>
            <Button className="flex-1 bg-purple-600 hover:bg-purple-700 text-white" onClick={handleSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Submit Dispute
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
