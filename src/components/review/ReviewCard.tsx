import { Star, Reply } from 'lucide-react';
import { format } from 'date-fns';
import type { Review } from '../../types';
import SubRatingPills from './SubRatingPills';
import ReviewResponse from './ReviewResponse';
import { Badge } from '../ui/badge';

interface ReviewCardProps {
  review: Review & { is_pending?: boolean };
  onRespond?: (reviewId: number) => void;
  respondentName?: string;
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`w-3.5 h-3.5 ${star <= rating ? 'fill-amber-400 text-amber-400' : 'text-stone-200'}`}
        />
      ))}
    </div>
  );
}

export default function ReviewCard({ review, onRespond, respondentName }: ReviewCardProps) {
  const isPending = (review as { is_pending?: boolean }).is_pending;

  return (
    <div className={isPending ? 'opacity-70' : ''}>
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
          {(review.reviewer_name ?? 'U').charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-grow">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold text-stone-900">
              {review.reviewer_name ?? 'Anonymous'}
            </span>
            <span className="text-xs text-stone-400">
              {format(new Date(review.created_at), 'MMM d, yyyy')}
            </span>
            {isPending && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 border-amber-200">
                ⏳ Pending
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2 mb-1.5">
            <StarRating rating={review.rating} />
            {review.service_type && (
              <span className="text-[10px] text-stone-400 capitalize">
                {review.service_type.replace(/[-_]/g, ' ')}
              </span>
            )}
          </div>

          <SubRatingPills review={review} />

          {review.comment && (
            <p className={`mt-1.5 text-sm ${isPending ? 'text-stone-500 italic' : 'text-stone-600'}`}>
              "{review.comment}"
            </p>
          )}

          {!review.comment && (
            <p className="mt-1 text-xs text-stone-400 italic">No comment</p>
          )}

          {review.response_text && review.response_at && respondentName && (
            <ReviewResponse
              responseText={review.response_text}
              responseAt={review.response_at}
              respondentName={respondentName}
            />
          )}

          {onRespond && !review.response_text && !isPending && (
            <button
              onClick={() => onRespond(review.id)}
              className="mt-2 text-xs font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
            >
              <Reply className="w-3 h-3" />
              Respond to this review
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
