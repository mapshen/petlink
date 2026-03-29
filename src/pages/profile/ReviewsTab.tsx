import { useEffect, useState } from 'react';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import type { Review } from '../../types';
import { Star, Loader2 } from 'lucide-react';
import { API_BASE } from '../../config';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { format } from 'date-fns';

export function computeReviewStats(reviews: Review[]): { average: number; count: number } {
  if (reviews.length === 0) return { average: 0, count: 0 };
  const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
  return {
    average: Math.round((sum / reviews.length) * 10) / 10,
    count: reviews.length,
  };
}

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`w-4 h-4 ${star <= rating ? 'fill-amber-400 text-amber-400' : 'text-stone-200'}`}
        />
      ))}
    </div>
  );
}

export default function ReviewsTab() {
  const { user, token } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const fetchReviews = async () => {
      try {
        const res = await fetch(`${API_BASE}/reviews/${user.id}`, {
          headers: getAuthHeaders(token),
        });
        if (!res.ok) throw new Error('Failed to load reviews');
        const data = await res.json();
        setReviews(data.reviews ?? []);
      } catch {
        setError('Failed to load reviews.');
      } finally {
        setLoading(false);
      }
    };
    fetchReviews();
  }, [user, token]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  const { average, count } = computeReviewStats(reviews);

  return (
    <div>
      <h2 className="text-lg font-bold text-stone-900 mb-6">Reviews</h2>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} aria-label="Dismiss error" className="text-xs font-medium hover:underline">Dismiss</button>
          </AlertDescription>
        </Alert>
      )}

      {count > 0 && (
        <div className="flex items-center gap-3 mb-6 p-4 bg-stone-50 rounded-xl border border-stone-200">
          <div className="flex items-center gap-1.5">
            <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
            <span className="text-xl font-bold text-stone-900">{average}</span>
          </div>
          <span className="text-sm text-stone-500">
            from {count} {count === 1 ? 'review' : 'reviews'}
          </span>
        </div>
      )}

      <div className="space-y-4">
        {reviews.map((review) => (
          <div key={review.id} className="p-4 bg-white rounded-xl border border-stone-100">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                {(review.reviewer_name ?? 'U').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-grow">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-stone-900">
                    {review.reviewer_name ?? 'Anonymous'}
                  </span>
                  <span className="text-xs text-stone-400">
                    {format(new Date(review.created_at), 'MMM d, yyyy')}
                  </span>
                </div>
                <StarRating rating={review.rating} />
                {review.comment && (
                  <p className="mt-2 text-sm text-stone-600 leading-relaxed">{review.comment}</p>
                )}
              </div>
            </div>
          </div>
        ))}

        {reviews.length === 0 && !error && (
          <div className="text-center py-12 bg-stone-50 rounded-xl border border-stone-200">
            <Star className="w-12 h-12 mx-auto mb-4 text-stone-300" />
            <p className="text-stone-500 mb-2">No reviews yet.</p>
            <p className="text-sm text-stone-400">Reviews from pet owners will appear here after bookings are completed.</p>
          </div>
        )}
      </div>
    </div>
  );
}
