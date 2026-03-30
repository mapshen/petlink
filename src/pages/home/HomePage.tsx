import React, { useEffect, useState, lazy, Suspense } from 'react';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { useMode } from '../../context/ModeContext';
import { Booking } from '../../types';
import { Calendar, MapPin, XCircle, RefreshCw, Star, Loader2 } from 'lucide-react';
import BookingReviewDetail from '../../components/review/BookingReviewDetail';

const CalendarCommandCenter = lazy(() => import('../../components/calendar/CalendarCommandCenter'));
const BookingHistory = lazy(() => import('../../components/calendar/BookingHistory'));
import { format } from 'date-fns';
import { API_BASE } from '../../config';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useOnboardingStatus } from '../../hooks/useOnboardingStatus';
import OnboardingChecklist from '../../components/onboarding/OnboardingChecklist';
import { useFavorites } from '../../hooks/useFavorites';
import { useReviewDialog } from '../../hooks/useReviewDialog';
import FavoriteSitters from '../../components/profile/FavoriteSitters';
import CareTasksChecklist from '../../components/booking/CareTasksChecklist';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { Avatar, AvatarImage, AvatarFallback } from '../../components/ui/avatar';
import { Alert, AlertDescription } from '../../components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';

export default function HomePage() {
  useDocumentTitle('Home');
  const { user, token } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [cancelDialogBookingId, setCancelDialogBookingId] = useState<number | null>(null);
  const [refundMessage, setRefundMessage] = useState<string | null>(null);
  const [expandedReviewId, setExpandedReviewId] = useState<number | null>(null);
  const [checklistDismissed, setChecklistDismissed] = useState(() =>
    localStorage.getItem('petlink_onboarding_dismissed') === 'true'
  );
  const { mode } = useMode();
  const isSitterMode = mode === 'sitter';
  const onboarding = useOnboardingStatus();
  const { favorites, toggleFavorite } = useFavorites();
  const review = useReviewDialog({ token, onError: setError, reviewerRole: isSitterMode ? 'sitter' : 'owner' });

  useEffect(() => {
    if (!user) return;
    const fetchBookings = async () => {
      try {
        const res = await fetch(`${API_BASE}/bookings`, {
          headers: getAuthHeaders(token)
        });
        if (!res.ok) throw new Error('Failed to load bookings');
        const data = await res.json();
        setBookings(data.bookings);
      } catch {
        setError('Failed to load bookings. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchBookings();
  }, [user, token]);

  const updateBookingStatus = async (bookingId: number, status: 'confirmed' | 'cancelled') => {
    setUpdatingIds((prev) => new Set([...prev, bookingId]));
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/bookings/${bookingId}/status`, {
        method: 'PUT',
        headers: getAuthHeaders(token),
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update booking');
      }
      const data = await res.json();
      if (data.refund) {
        const pct = data.refund.refundPercent;
        const msg = pct > 0 ? `You will receive a ${pct}% refund.` : 'No refund is available per the cancellation policy.';
        setRefundMessage(`Booking cancelled. ${msg}`);
      }
      setBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, status: data.booking.status } : b))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update booking status.');
    } finally {
      setUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(bookingId);
        return next;
      });
    }
  };

  const handleCancelConfirm = () => {
    if (cancelDialogBookingId !== null) {
      updateBookingStatus(cancelDialogBookingId, 'cancelled');
      setCancelDialogBookingId(null);
    }
  };

  if (loading) return <div className="flex justify-center py-12" role="status" aria-live="polite"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div><span className="sr-only">Loading...</span></div>;

  const statusVariant = (status: string) => {
    switch (status) {
      case 'confirmed': return 'default' as const;
      case 'pending': return 'secondary' as const;
      case 'cancelled': return 'destructive' as const;
      default: return 'outline' as const;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-stone-900 mb-8">Home</h1>

      {isSitterMode && user?.approval_status === 'approved' && (
        <Suspense fallback={<div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-emerald-600" /></div>}>
          <div className="mb-6">
            <CalendarCommandCenter />
          </div>
          <div className="mb-6">
            <BookingHistory />
          </div>
        </Suspense>
      )}

      {isSitterMode && user?.approval_status === 'pending_approval' && (
        <Alert className="mb-6 border-amber-200 bg-amber-50">
          <AlertDescription className="text-amber-800">
            Your sitter account is under review. We'll notify you once approved. You can still edit your profile while waiting.
          </AlertDescription>
        </Alert>
      )}

      {isSitterMode && user?.approval_status === 'rejected' && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>
            Your sitter application was not approved.
            {user?.approval_rejected_reason && (
              <span className="block mt-1 text-sm opacity-80">Reason: {user?.approval_rejected_reason}</span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {user?.approval_status === 'banned' && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>
            Your account has been suspended. Please contact support.
          </AlertDescription>
        </Alert>
      )}

      {isSitterMode && !onboarding.loading && !onboarding.isComplete && !checklistDismissed && (
        <OnboardingChecklist
          status={onboarding}
          onDismiss={() => {
            setChecklistDismissed(true);
            localStorage.setItem('petlink_onboarding_dismissed', 'true');
          }}
        />
      )}

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} aria-label="Dismiss error" className="text-xs font-medium hover:underline">Dismiss</button>
          </AlertDescription>
        </Alert>
      )}

      {!isSitterMode && favorites.length > 0 && (
        <div className="mb-6">
          <FavoriteSitters favorites={favorites} onToggle={toggleFavorite} />
        </div>
      )}

      {!isSitterMode && (
        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
          <div className="border-b border-stone-100 px-6 py-4 bg-stone-50">
            <h2 className="font-bold text-stone-700">Your Bookings</h2>
          </div>

          {(() => {
            const filteredBookings = bookings.filter((b) => user?.id === b.owner_id);
            return filteredBookings.length === 0 ? (
            <div className="p-12 text-center text-stone-500">
              <Calendar className="w-12 h-12 mx-auto mb-4 text-stone-300" />
              <p>No bookings yet.</p>
            </div>
          ) : (
            <div className="divide-y divide-stone-100">
              {filteredBookings.map((booking) => (
                  <div key={booking.id} className="p-6 hover:bg-stone-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <Avatar className="h-12 w-12 border border-stone-200">
                          <AvatarImage src={booking.sitter_avatar || undefined} alt={booking.sitter_name} />
                          <AvatarFallback>{booking.sitter_name?.charAt(0)?.toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div>
                          <h3 className="font-bold text-stone-900">{booking.sitter_name}</h3>
                          <div className="text-sm text-stone-500 capitalize">{booking.service_type?.replace(/[-_]/g, ' ')}</div>
                          {booking.pets && booking.pets.length > 0 && (
                            <div className="text-xs text-stone-400 mt-0.5">
                              {booking.pets.map((p) => p.name).join(', ')}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-sm font-medium text-stone-900">
                          {format(new Date(booking.start_time), 'MMM d, yyyy')}
                        </div>
                        <div className="text-xs text-stone-500">
                          {format(new Date(booking.start_time), 'h:mm a')} - {format(new Date(booking.end_time), 'h:mm a')}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between">
                      <Badge variant={statusVariant(booking.status)} className="capitalize">
                        {booking.status}
                      </Badge>

                      <div className="flex items-center gap-2">
                        {(booking.status === 'pending' || booking.status === 'confirmed') && (
                          <Button
                            size="xs"
                            variant="outline"
                            className="text-red-700 border-red-200 hover:bg-red-50"
                            onClick={() => setCancelDialogBookingId(booking.id)}
                            disabled={updatingIds.has(booking.id)}
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Cancel
                          </Button>
                        )}

                        {booking.status === 'in_progress' && (
                          <Button size="xs" variant="ghost" asChild>
                            <Link to={`/track/${booking.id}`}>
                              <MapPin className="w-4 h-4" />
                              Track Walk
                            </Link>
                          </Button>
                        )}

                        {booking.status === 'completed' && (
                          <Button size="xs" variant="outline" asChild>
                            <Link to={`/sitter/${booking.sitter_id}?serviceId=${booking.service_id}`}>
                              <RefreshCw className="w-3.5 h-3.5" />
                              Book Again
                            </Link>
                          </Button>
                        )}
                      </div>
                    </div>

                    {(booking.status === 'confirmed' || booking.status === 'in_progress') && (
                      <div className="mt-4">
                        <CareTasksChecklist bookingId={booking.id} token={token} isSitter={false} />
                      </div>
                    )}

                    {booking.status === 'completed' && (
                      <div className="mt-3 pt-3 border-t border-stone-100">
                        <button
                          onClick={() => setExpandedReviewId(expandedReviewId === booking.id ? null : booking.id)}
                          className="text-xs font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                        >
                          <Star className="w-3.5 h-3.5" />
                          {expandedReviewId === booking.id ? 'Hide Reviews' : 'Show Reviews'}
                        </button>
                        {expandedReviewId === booking.id && (
                          <BookingReviewDetail
                            bookingId={booking.id}
                            userId={user?.id ?? 0}
                            token={token}
                            onLeaveReview={(id) => review.openReview(id)}
                          />
                        )}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          );
          })()}
        </div>
      )}


      <AlertDialog open={cancelDialogBookingId !== null} onOpenChange={(open) => { if (!open) setCancelDialogBookingId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Booking</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this booking? Refund depends on the sitter's cancellation policy. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Booking</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleCancelConfirm}>
              Cancel Booking
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Review Dialog */}
      <AlertDialog open={review.reviewBookingId !== null} onOpenChange={(open) => { if (!open) review.closeReview(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
              Leave a Review
            </AlertDialogTitle>
            <AlertDialogDescription>
              How was your experience? Your review will be visible after both parties submit or after 3 days.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-sm font-medium text-stone-700 mb-2 block">Overall Rating</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => review.setReviewRating(star)}
                    aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
                    className="p-0.5 transition-colors"
                  >
                    <Star className={`w-8 h-8 ${star <= review.reviewRating ? 'fill-amber-400 text-amber-400' : 'text-stone-200 hover:text-amber-200'}`} />
                  </button>
                ))}
              </div>
            </div>

            {/* Sub-ratings */}
            <div className="p-3 bg-stone-50 rounded-xl border border-stone-200">
              <label className="text-[10px] font-semibold text-stone-500 uppercase tracking-wide mb-2.5 block">
                Rate specific areas (optional)
              </label>
              <div className="space-y-2.5">
                {review.subRatingCategories.map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-xs text-stone-700">{label}</span>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() => review.setSubRating(key, review.subRatings[key] === star ? null : star)}
                          aria-label={`Rate ${label} ${star} star${star > 1 ? 's' : ''}`}
                          className="p-0.5"
                        >
                          <Star className={`w-5 h-5 ${star <= (review.subRatings[key] ?? 0) ? 'fill-amber-400 text-amber-400' : 'text-stone-200 hover:text-amber-200'}`} />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="review-comment" className="text-sm font-medium text-stone-700 mb-2 block">Comment (optional)</label>
              <textarea
                id="review-comment"
                value={review.reviewComment}
                onChange={(e) => review.setReviewComment(e.target.value)}
                placeholder="Tell others about your experience..."
                rows={3}
                maxLength={1000}
                className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-2.5">
              <p className="text-[10px] text-blue-700">🔒 Your review will be visible after both parties submit or after 3 days.</p>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={review.submitReview} disabled={review.reviewSubmitting}>
              {review.reviewSubmitting ? 'Submitting...' : 'Submit Review'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={refundMessage !== null} onOpenChange={(open) => { if (!open) setRefundMessage(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Booking Cancelled</AlertDialogTitle>
            <AlertDialogDescription>{refundMessage}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
