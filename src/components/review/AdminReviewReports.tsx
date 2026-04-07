import { useState, useEffect, useCallback } from 'react';
import { Flag, Loader2, Star, Eye, EyeOff, Ban, CheckCircle2 } from 'lucide-react';
import { getAuthHeaders } from '../../context/AuthContext';
import { API_BASE } from '../../config';
import type { ReviewReportStatus } from '../../types';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Card, CardContent } from '../ui/card';
import { Alert, AlertDescription } from '../ui/alert';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { format } from 'date-fns';

interface AdminReport {
  id: number;
  review_id: number;
  reporter_id: number;
  reason: string;
  description: string | null;
  status: ReviewReportStatus;
  admin_id: number | null;
  created_at: string;
  reviewed_at: string | null;
  review_rating: number;
  review_comment: string | null;
  reviewer_id: number;
  reviewee_id: number;
  review_hidden_at: string | null;
  reporter_name: string;
  reporter_email: string;
  reviewer_name: string;
  reviewer_email: string;
  reviewee_name: string;
}

type ActionType = 'dismiss' | 'hide_review' | 'ban_reviewer';

interface AdminReviewReportsProps {
  token: string | null;
}

const REASON_LABELS: Record<string, string> = {
  inappropriate_language: 'Inappropriate Language',
  spam: 'Spam',
  fake_review: 'Fake Review',
  harassment: 'Harassment',
  other: 'Other',
};

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  dismissed: 'bg-stone-100 text-stone-600',
  actioned: 'bg-red-100 text-red-700',
};

export default function AdminReviewReports({ token }: AdminReviewReportsProps) {
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ReviewReportStatus | 'all'>('pending');
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ report: AdminReport; action: ActionType } | null>(null);

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true);
      const statusParam = statusFilter !== 'all' ? `&status=${statusFilter}` : '';
      const res = await fetch(`${API_BASE}/admin/review-reports?limit=50${statusParam}`, {
        headers: getAuthHeaders(token),
      });
      if (!res.ok) throw new Error('Failed to load reports');
      const data = await res.json();
      setReports(data.reports);
      setTotal(data.total);
    } catch {
      setError('Failed to load flagged reviews.');
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const handleAction = async () => {
    if (!confirmAction) return;
    const { report, action } = confirmAction;
    setProcessingId(report.id);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/review-reports/${report.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(token),
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to process report');
      }
      setConfirmAction(null);
      await fetchReports();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process report');
    } finally {
      setProcessingId(null);
    }
  };

  const reasonBadge = (reason: string) => (
    <Badge variant="outline" className="text-xs capitalize">
      {REASON_LABELS[reason] || reason}
    </Badge>
  );

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        {(['pending', 'dismissed', 'actioned', 'all'] as const).map((s) => (
          <Button
            key={s}
            variant={statusFilter === s ? 'default' : 'outline'}
            size="sm"
            onClick={() => setStatusFilter(s)}
          >
            {s === 'all' ? `All (${total})` : s.charAt(0).toUpperCase() + s.slice(1)}
          </Button>
        ))}
      </div>

      {reports.length === 0 ? (
        <div className="text-center py-12 bg-stone-50 rounded-xl border border-stone-200">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-emerald-300" />
          <p className="text-stone-500">
            {statusFilter === 'pending' ? 'No pending reports.' : 'No reports found.'}
          </p>
        </div>
      ) : (
        reports.map((report) => (
          <Card key={report.id}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-grow space-y-3">
                  {/* Report info */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <Flag className="w-4 h-4 text-red-400" />
                    {reasonBadge(report.reason)}
                    <Badge className={STATUS_STYLES[report.status]}>
                      {report.status}
                    </Badge>
                    <span className="text-xs text-stone-400">
                      {format(new Date(report.created_at), 'MMM d, yyyy h:mm a')}
                    </span>
                  </div>

                  {/* Review content */}
                  <div className="bg-stone-50 rounded-lg p-3 border border-stone-100">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-stone-700">
                        Review by {report.reviewer_name}
                      </span>
                      <span className="text-xs text-stone-400">of {report.reviewee_name}</span>
                      <div className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={`w-3 h-3 ${s <= report.review_rating ? 'fill-amber-400 text-amber-400' : 'text-stone-200'}`}
                          />
                        ))}
                      </div>
                    </div>
                    {report.review_comment ? (
                      <p className="text-sm text-stone-600">"{report.review_comment}"</p>
                    ) : (
                      <p className="text-xs text-stone-400 italic">No comment</p>
                    )}
                    {report.review_hidden_at && (
                      <Badge className="mt-2 bg-red-100 text-red-700 text-[10px]">Already hidden</Badge>
                    )}
                  </div>

                  {/* Reporter info */}
                  <div className="text-xs text-stone-500">
                    Reported by <span className="font-medium">{report.reporter_name}</span> ({report.reporter_email})
                    {report.description && (
                      <p className="mt-1 text-stone-600">"{report.description}"</p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {report.status === 'pending' && (
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setConfirmAction({ report, action: 'dismiss' })}
                      disabled={processingId !== null}
                    >
                      <Eye className="w-3.5 h-3.5 mr-1" />
                      Dismiss
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-amber-700 border-amber-200 hover:bg-amber-50"
                      onClick={() => setConfirmAction({ report, action: 'hide_review' })}
                      disabled={processingId !== null || !!report.review_hidden_at}
                    >
                      <EyeOff className="w-3.5 h-3.5 mr-1" />
                      Hide Review
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setConfirmAction({ report, action: 'ban_reviewer' })}
                      disabled={processingId !== null}
                    >
                      <Ban className="w-3.5 h-3.5 mr-1" />
                      Ban Reviewer
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}

      {/* Confirmation Dialog */}
      <AlertDialog open={confirmAction !== null} onOpenChange={(open) => { if (!open) setConfirmAction(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.action === 'dismiss' && 'Dismiss Report'}
              {confirmAction?.action === 'hide_review' && 'Hide Review'}
              {confirmAction?.action === 'ban_reviewer' && 'Ban Reviewer'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.action === 'dismiss' && 'This will dismiss the report and keep the review visible. Are you sure?'}
              {confirmAction?.action === 'hide_review' && 'This will hide the review from all users. It will show as "[Review removed for policy violation]".'}
              {confirmAction?.action === 'ban_reviewer' && `This will ban ${confirmAction?.report.reviewer_name}, hide ALL their reviews, and action all pending reports. This cannot be easily undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={processingId !== null}>Cancel</AlertDialogCancel>
            <Button
              variant={confirmAction?.action === 'dismiss' ? 'default' : 'destructive'}
              onClick={handleAction}
              disabled={processingId !== null}
            >
              {processingId ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Confirm
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
