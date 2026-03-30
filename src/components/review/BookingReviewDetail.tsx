import { useState, useEffect, useCallback } from 'react';
import { Star, Loader2 } from 'lucide-react';
import { getAuthHeaders } from '../../context/AuthContext';
import { API_BASE } from '../../config';
import type { Review, BookingReviewState } from '../../types';
import ReviewCard from './ReviewCard';
import { Button } from '../ui/button';

interface BookingReviewDetailProps {
  bookingId: number;
  userId: number;
  token: string | null;
  onLeaveReview?: (bookingId: number) => void;
  compact?: boolean;
}

export default function BookingReviewDetail({ bookingId, userId, token, onLeaveReview, compact }: BookingReviewDetailProps) {
  const [state, setState] = useState<BookingReviewState | null>(null);
  const [loading, setLoading] = useState(true);
  const [respondingTo, setRespondingTo] = useState<number | null>(null);
  const [responseText, setResponseText] = useState('');
  const [submittingResponse, setSubmittingResponse] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/reviews/booking/${bookingId}`, {
        headers: getAuthHeaders(token),
      });
      if (!res.ok) return;
      const data = await res.json();
      setState(data);
    } catch {
      // Silently fail — booking may not have reviews
    } finally {
      setLoading(false);
    }
  }, [bookingId, token]);

  useEffect(() => { fetchState(); }, [fetchState]);

  const handleSubmitResponse = async () => {
    if (!respondingTo || !responseText.trim()) return;
    setSubmittingResponse(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/reviews/${respondingTo}/respond`, {
        method: 'PUT',
        headers: getAuthHeaders(token),
        body: JSON.stringify({ response_text: responseText }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to submit response');
      }
      setRespondingTo(null);
      setResponseText('');
      await fetchState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit response');
    } finally {
      setSubmittingResponse(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-2"><Loader2 className="w-4 h-4 animate-spin text-stone-400" /></div>;
  }

  if (!state) return null;

  const myReview = state.reviews.find((r) => r.reviewer_id === userId);
  const theirReview = state.reviews.find((r) => r.reviewer_id !== userId);
  const hasContent = myReview || theirReview || state.can_review;

  if (!hasContent) return null;

  // Get the reviewee name for responses
  const myRevieweeName = myReview?.reviewee_name ?? '';
  const theirRevieweeName = theirReview?.reviewee_name ?? '';

  return (
    <div className={`${compact ? 'pt-3' : 'mt-3 pt-3'} border-t border-stone-100`}>
      <div className="flex gap-5">
        {/* Left: Your review */}
        <div className="flex-1 min-w-0">
          {myReview ? (
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-semibold text-stone-600">
                  Your Review{myReview.reviewee_name ? ` of ${myReview.reviewee_name}` : ''}
                </span>
              </div>
              <ReviewCard
                review={myReview}
                respondentName={myRevieweeName}
              />
            </div>
          ) : state.can_review && onLeaveReview ? (
            <div className="flex items-center justify-between">
              <span className="text-xs text-stone-400">How was your experience?</span>
              <Button
                size="xs"
                variant="outline"
                className="text-emerald-700 border-emerald-200 bg-emerald-50 hover:bg-emerald-100"
                onClick={() => onLeaveReview(bookingId)}
              >
                <Star className="w-3.5 h-3.5" />
                Leave Review
              </Button>
            </div>
          ) : state.can_review ? (
            <p className="text-xs text-stone-400">Leave a review from the Dashboard.</p>
          ) : (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-semibold text-stone-400">Your Review</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-400 font-medium">
                  Window closed
                </span>
              </div>
              <p className="text-xs text-stone-400">The 3-day review window has passed.</p>
            </div>
          )}
        </div>

        {/* Right: Their review of you (only if visible) */}
        {(theirReview || (!state.can_review && !myReview)) && (
          <div className="flex-1 min-w-0 pl-5 border-l border-stone-200">
            {theirReview ? (
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-semibold text-stone-600">
                    {theirReview.reviewer_name}'s Review of You
                  </span>
                </div>
                <ReviewCard
                  review={theirReview}
                  onRespond={state.can_respond[theirReview.id] ? setRespondingTo : undefined}
                  respondentName={theirRevieweeName}
                />

                {/* Inline response form */}
                {respondingTo === theirReview.id && (
                  <div className="mt-3 p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                    <label className="text-xs font-semibold text-emerald-700 mb-1.5 block">
                      Your Response
                    </label>
                    <textarea
                      rows={2}
                      value={responseText}
                      onChange={(e) => setResponseText(e.target.value)}
                      maxLength={1000}
                      placeholder="Respond professionally..."
                      className="w-full px-3 py-2 border border-emerald-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-emerald-400 focus:border-transparent"
                    />
                    {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-[10px] text-stone-400">Publicly visible</p>
                      <div className="flex gap-2">
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => { setRespondingTo(null); setResponseText(''); setError(null); }}
                        >
                          Cancel
                        </Button>
                        <Button
                          size="xs"
                          onClick={handleSubmitResponse}
                          disabled={submittingResponse || !responseText.trim()}
                        >
                          {submittingResponse ? 'Posting...' : 'Post Response'}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
