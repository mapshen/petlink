import { useState } from 'react';
import { Flag, Loader2, CheckCircle2 } from 'lucide-react';
import { getAuthHeaders } from '../../context/AuthContext';
import { API_BASE } from '../../config';
import { Button } from '../ui/button';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';

type ReportReason = 'inappropriate_language' | 'spam' | 'fake_review' | 'harassment' | 'other';

const REASON_OPTIONS: { value: ReportReason; label: string }[] = [
  { value: 'inappropriate_language', label: 'Inappropriate language' },
  { value: 'spam', label: 'Spam' },
  { value: 'fake_review', label: 'Fake review' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'other', label: 'Other' },
];

interface ReportReviewDialogProps {
  reviewId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string | null;
}

export default function ReportReviewDialog({ reviewId, open, onOpenChange, token }: ReportReviewDialogProps) {
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!reason) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/reviews/${reviewId}/report`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          reason,
          description: description.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to submit report');
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset after close animation
    setTimeout(() => {
      setReason('');
      setDescription('');
      setError(null);
      setSubmitted(false);
    }, 200);
  };

  return (
    <AlertDialog open={open} onOpenChange={handleClose}>
      <AlertDialogContent>
        {submitted ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                Report Submitted
              </AlertDialogTitle>
              <AlertDialogDescription>
                Thank you for your report. Our team will review it and take action if necessary.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Flag className="w-5 h-5 text-red-500" />
                Report This Review
              </AlertDialogTitle>
              <AlertDialogDescription>
                Help us maintain a trustworthy community. Select the reason this review violates our guidelines.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-4 py-2">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-2">Reason</label>
                <div className="space-y-2">
                  {REASON_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                        reason === opt.value
                          ? 'border-emerald-300 bg-emerald-50'
                          : 'border-stone-200 hover:bg-stone-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="report-reason"
                        value={opt.value}
                        checked={reason === opt.value}
                        onChange={() => setReason(opt.value)}
                        className="accent-emerald-600"
                      />
                      <span className="text-sm text-stone-700">{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1">
                  Details <span className="text-stone-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={1000}
                  rows={3}
                  placeholder="Provide additional context..."
                  className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <Button
                variant="destructive"
                onClick={handleSubmit}
                disabled={!reason || submitting}
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Submit Report
              </Button>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
