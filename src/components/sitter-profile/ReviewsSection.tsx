import { Star, Flag } from 'lucide-react';
import SubRatingBars from '../review/SubRatingBars';
import SubRatingPills from '../review/SubRatingPills';
import ReviewResponse from '../review/ReviewResponse';
import ImportedReviewBadge from '../profile/ImportedReviewBadge';
import type { User, Review, ImportedReview } from '../../types';

interface ReviewsSectionProps {
  readonly sitter: User;
  readonly reviews: Review[];
  readonly importedReviews: ImportedReview[];
  readonly currentUser: User | null;
  readonly onReportReview: (reviewId: number) => void;
}

export default function ReviewsSection({ sitter, reviews, importedReviews, currentUser, onReportReview }: ReviewsSectionProps) {
  return (
    <div className="py-6 px-4" role="tabpanel" aria-label="Reviews">
      <div className="max-w-2xl mx-auto">
        {/* Rating summary */}
        {reviews.length > 0 && (
          <div className="bg-white rounded-2xl border border-stone-200 p-5 mb-4 text-center">
            <div className="text-5xl font-extrabold text-amber-500">{sitter.avg_rating}</div>
            <div className="flex justify-center gap-0.5 my-1">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className={`w-4 h-4 ${i < Math.round(sitter.avg_rating ?? 0) ? 'fill-amber-400 text-amber-400' : 'text-stone-200'}`} />
              ))}
            </div>
            <p className="text-sm text-stone-500">Based on {sitter.review_count} reviews</p>
            <div className="mt-4">
              <SubRatingBars reviews={reviews} />
            </div>
          </div>
        )}

        {/* Individual reviews */}
        <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
          {reviews.map((review, idx) => (
            <div key={review.id} className={`p-5 ${idx < reviews.length - 1 ? 'border-b border-stone-100' : ''}`}>
              <div className="flex items-center gap-2.5 mb-2">
                <img
                  src={review.reviewer_avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(review.reviewer_name ?? 'U')}&size=36`}
                  alt={review.reviewer_name ?? 'Reviewer'}
                  className="w-9 h-9 rounded-full"
                />
                <div>
                  <div className="text-sm font-semibold text-stone-900">{review.reviewer_name}</div>
                  <div className="text-xs text-stone-500">{new Date(review.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                </div>
              </div>
              <div className="flex gap-0.5 mb-1.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className={`w-3 h-3 ${i < review.rating ? 'fill-amber-400 text-amber-400' : 'text-stone-200'}`} />
                ))}
              </div>
              <SubRatingPills review={review} />
              {review.comment && <p className="text-sm text-stone-600 leading-relaxed mt-1.5">{review.comment}</p>}
              {review.response_text && review.response_at && (
                <ReviewResponse
                  responseText={review.response_text}
                  responseAt={review.response_at}
                  respondentName={sitter.name}
                />
              )}
              {currentUser && currentUser.id !== review.reviewer_id && (
                <button
                  onClick={() => onReportReview(review.id)}
                  className="mt-2 text-xs font-medium text-stone-400 hover:text-red-500 flex items-center gap-1 transition-colors"
                >
                  <Flag className="w-3 h-3" />
                  Report
                </button>
              )}
            </div>
          ))}
          {reviews.length === 0 && importedReviews.length === 0 && (
            <div className="p-8 text-center">
              <p className="text-stone-500 italic">
                {currentUser ? 'No reviews yet.' : 'Log in to see reviews.'}
              </p>
            </div>
          )}
        </div>

        {importedReviews.length > 0 && (
          <div className="mt-4 bg-white rounded-2xl border border-stone-200 p-5">
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-lg font-bold text-stone-900">Imported Reviews</h3>
              <ImportedReviewBadge platform={importedReviews[0].platform} />
            </div>
            <div className="space-y-4">
              {importedReviews.map((review) => (
                <div key={review.id} className="border-b border-stone-100 pb-4 last:border-0 last:pb-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-sm text-stone-900">{review.reviewer_name}</span>
                    <div className="flex text-amber-400 text-xs">
                      {[...Array(5)].map((_, i) => (
                        <Star key={i} className={`w-3 h-3 ${i < (review.rating ?? 5) ? 'fill-current' : 'text-stone-200'}`} />
                      ))}
                    </div>
                    {review.review_date && (
                      <span className="text-xs text-stone-400 ml-auto">{review.review_date}</span>
                    )}
                  </div>
                  {review.comment && <p className="text-sm text-stone-600">{review.comment}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
