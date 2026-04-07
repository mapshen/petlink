import { useState } from 'react';
import { getAuthHeaders } from '../context/AuthContext';
import { API_BASE } from '../config';
import type { PrivateReviewFlag } from '../types';

interface SubRatings {
  pet_care_rating: number | null;
  communication_rating: number | null;
  reliability_rating: number | null;
  pet_accuracy_rating: number | null;
  preparedness_rating: number | null;
}

const EMPTY_SUB_RATINGS: SubRatings = {
  pet_care_rating: null,
  communication_rating: null,
  reliability_rating: null,
  pet_accuracy_rating: null,
  preparedness_rating: null,
};

interface UseReviewDialogOptions {
  token: string | null;
  onError: (message: string) => void;
  reviewerRole?: 'owner' | 'sitter';
  onSuccess?: () => void;
}

export function useReviewDialog({ token, onError, reviewerRole = 'owner', onSuccess }: UseReviewDialogOptions) {
  const [reviewBookingId, setReviewBookingId] = useState<number | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [subRatings, setSubRatings] = useState<SubRatings>({ ...EMPTY_SUB_RATINGS });
  const [privateFlags, setPrivateFlags] = useState<PrivateReviewFlag[]>([]);
  const [privateNote, setPrivateNote] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewedBookingIds, setReviewedBookingIds] = useState<Set<number>>(new Set());

  const setSubRating = (key: keyof SubRatings, value: number | null) => {
    setSubRatings((prev) => ({ ...prev, [key]: value }));
  };

  const togglePrivateFlag = (flag: PrivateReviewFlag) => {
    setPrivateFlags((prev) =>
      prev.includes(flag) ? prev.filter((f) => f !== flag) : [...prev, flag]
    );
  };

  const openReview = (bookingId: number) => {
    setReviewBookingId(bookingId);
    setReviewRating(5);
    setReviewComment('');
    setSubRatings({ ...EMPTY_SUB_RATINGS });
    setPrivateFlags([]);
    setPrivateNote('');
  };

  const closeReview = () => {
    setReviewBookingId(null);
    setReviewRating(5);
    setReviewComment('');
    setSubRatings({ ...EMPTY_SUB_RATINGS });
    setPrivateFlags([]);
    setPrivateNote('');
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
          ...subRatings,
          private_flags: privateFlags.length > 0 ? privateFlags : [],
          private_note: privateNote.trim() || null,
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
      setSubRatings({ ...EMPTY_SUB_RATINGS });
      setPrivateFlags([]);
      setPrivateNote('');
      onSuccess?.();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to submit review');
    } finally {
      setReviewSubmitting(false);
    }
  };

  const isReviewed = (bookingId: number) => reviewedBookingIds.has(bookingId);

  // Sub-rating categories depend on reviewer role
  const subRatingCategories = reviewerRole === 'owner'
    ? [
        { key: 'pet_care_rating' as const, label: '🐾 Pet Care' },
        { key: 'communication_rating' as const, label: '💬 Communication' },
        { key: 'reliability_rating' as const, label: '⏰ Reliability' },
      ]
    : [
        { key: 'pet_accuracy_rating' as const, label: '📋 Pet Description' },
        { key: 'communication_rating' as const, label: '💬 Communication' },
        { key: 'preparedness_rating' as const, label: '🏠 Preparedness' },
      ];

  return {
    reviewBookingId,
    reviewRating,
    setReviewRating,
    reviewComment,
    setReviewComment,
    subRatings,
    setSubRating,
    subRatingCategories,
    privateFlags,
    togglePrivateFlag,
    privateNote,
    setPrivateNote,
    reviewSubmitting,
    isReviewed,
    openReview,
    closeReview,
    submitReview,
  };
}
