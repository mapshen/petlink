import { useState } from 'react';
import { getAuthHeaders } from '../context/AuthContext';
import { API_BASE } from '../config';

interface UseReviewDialogOptions {
  token: string | null;
  onError: (message: string) => void;
}

export function useReviewDialog({ token, onError }: UseReviewDialogOptions) {
  const [reviewBookingId, setReviewBookingId] = useState<number | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewedBookingIds, setReviewedBookingIds] = useState<Set<number>>(new Set());

  const openReview = (bookingId: number) => {
    setReviewBookingId(bookingId);
    setReviewRating(5);
    setReviewComment('');
  };

  const closeReview = () => {
    setReviewBookingId(null);
    setReviewRating(5);
    setReviewComment('');
  };

  const submitReview = async () => {
    if (!reviewBookingId) return;
    setReviewSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/reviews`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          booking_id: reviewBookingId,
          rating: reviewRating,
          comment: reviewComment || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to submit review');
      }
      setReviewedBookingIds((prev) => new Set([...prev, reviewBookingId]));
      setReviewBookingId(null);
      setReviewRating(5);
      setReviewComment('');
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to submit review');
    } finally {
      setReviewSubmitting(false);
    }
  };

  const isReviewed = (bookingId: number) => reviewedBookingIds.has(bookingId);

  return {
    reviewBookingId,
    reviewRating,
    setReviewRating,
    reviewComment,
    setReviewComment,
    reviewSubmitting,
    isReviewed,
    openReview,
    closeReview,
    submitReview,
  };
}
