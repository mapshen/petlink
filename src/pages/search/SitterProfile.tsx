import React, { useEffect, useState, useCallback, useRef, lazy, Suspense } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { User, Pet, Service, Review, Availability, SitterPhoto, ImportedReview } from '../../types';
import ImportedReviewBadge from '../../components/profile/ImportedReviewBadge';
import SubRatingBars from '../../components/review/SubRatingBars';
import SubRatingPills from '../../components/review/SubRatingPills';
import ReviewResponse from '../../components/review/ReviewResponse';
import SitterProfileHeader from '../../components/sitter-profile/SitterProfileHeader';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { Star, AlertCircle, CreditCard, ShieldCheck } from 'lucide-react';
import { API_BASE } from '../../config';
import { reverseGeocode } from '../../lib/geo';

const SitterLocationMap = lazy(() => import('../../components/map/SitterLocationMap'));
import BookingCalendar from '../../components/booking/BookingCalendar';
import TimeSlotPicker from '../../components/booking/TimeSlotPicker';
import PhotoGallery from '../../components/profile/PhotoGallery';
import PetSelector from '../../components/booking/PetSelector';
import { useFavorites } from '../../hooks/useFavorites';
import PaymentForm from '../../components/payment/PaymentForm';
import { usePaymentIntent } from '../../hooks/usePaymentIntent';
import { calculateBookingPrice } from '../../shared/pricing';
import { getPolicyDescription } from '../../shared/cancellation';
import { Alert, AlertDescription } from '../../components/ui/alert';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '../../components/ui/alert-dialog';

export default function SitterProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const serviceIdParam = searchParams.get('serviceId');
  const { user, token } = useAuth();
  const { isFavorited, toggleFavorite } = useFavorites();
  const [sitter, setSitter] = useState<User | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [photos, setPhotos] = useState<SitterPhoto[]>([]);
  const [importedReviews, setImportedReviews] = useState<ImportedReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedService, setSelectedService] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [pets, setPets] = useState<Pet[]>([]);
  const [selectedPetIds, setSelectedPetIds] = useState<number[]>([]);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const { clientSecret, loading: paymentLoading, error: paymentError, createIntent } = usePaymentIntent();
  const [bookingLoading, setBookingLoading] = useState(false);
  const [cityName, setCityName] = useState<string | null>(null);
  const [postCount, setPostCount] = useState(0);
  const bookingRef = useRef<HTMLDivElement>(null);

  const scrollToBooking = useCallback(() => {
    bookingRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleAvailabilityLoaded = useCallback((data: Availability[]) => {
    setAvailability(data);
  }, []);

  const handleDateSelect = useCallback((date: Date) => {
    setSelectedDate(date);
    setSelectedTime(null);
  }, []);

  // Track profile view after sitter data loads (uses numeric ID)
  useEffect(() => {
    if (!sitter) return;
    const fromParam = searchParams.get('from');
    const source = fromParam === 'search' ? 'search' : fromParam === 'favorites' ? 'favorites' : 'direct';

    let sessionId = sessionStorage.getItem('petlink_view_session');
    if (!sessionId) {
      sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem('petlink_view_session', sessionId);
    }

    fetch(`${API_BASE}/sitters/${sitter.id}/view`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, session_id: sessionId }),
    }).catch(() => {});
  }, [sitter, searchParams]);

  useEffect(() => {
    const fetchSitter = async () => {
      try {
        const res = await fetch(`${API_BASE}/sitters/${id}`);
        if (!res.ok) throw new Error('Sitter not found');
        const data = await res.json();
        setSitter(data.sitter);
        setServices(data.services);
        setReviews(data.reviews);
        setPhotos(data.photos || []);
        setImportedReviews(data.imported_reviews || []);
        const rebookServiceId = Number(serviceIdParam);
        const matchedService = rebookServiceId && data.services.find((s: Service) => s.id === rebookServiceId);
        setSelectedService(matchedService ? matchedService.id : data.services.length > 0 ? data.services[0].id : null);
      } catch {
        setError('Failed to load sitter profile.');
      } finally {
        setLoading(false);
      }
    };
    fetchSitter();
  }, [id, serviceIdParam]);

  const sitterId = sitter?.id;
  const sitterLat = sitter?.lat;
  const sitterLng = sitter?.lng;

  useEffect(() => {
    if (sitterId == null) return;
    if (sitterLat != null && sitterLng != null) {
      reverseGeocode(sitterLat, sitterLng).then((city) => {
        if (city) setCityName(city);
      });
    }
    fetch(`${API_BASE}/sitter-posts/${sitterId}?limit=1`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data) setPostCount(data.total); })
      .catch(() => {});
  }, [sitterId, sitterLat, sitterLng]);

  useEffect(() => {
    if (!user || !token) return;
    const fetchPets = async () => {
      try {
        const res = await fetch(`${API_BASE}/pets`, { headers: getAuthHeaders(token) });
        if (res.ok) {
          const data = await res.json();
          setPets(data.pets);
          if (data.pets.length === 1) setSelectedPetIds([data.pets[0].id]);
        }
      } catch {
        // Non-critical
      }
    };
    fetchPets();
  }, [user, token]);

  const handleBooking = async () => {
    if (!user) {
      navigate('/login');
      return;
    }

    if (!selectedService || !selectedDate || !selectedTime || selectedPetIds.length === 0) return;
    setBookingError(null);
    setBookingLoading(true);

    try {
      const [hours, minutes] = selectedTime.split(':').map(Number);
      const startDate = new Date(selectedDate);
      startDate.setHours(hours, minutes, 0, 0);
      const selectedSvc = services.find((s) => s.id === selectedService);
      const durationMs = selectedSvc?.type === 'meet_greet' ? 1800000 : 3600000; // 30 min or 1 hour
      const endDate = new Date(startDate.getTime() + durationMs);

      const res = await fetch(`${API_BASE}/bookings`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          sitter_id: sitter?.id,
          service_id: selectedService,
          pet_ids: selectedPetIds,
          start_time: startDate.toISOString(),
          end_time: endDate.toISOString(),
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Booking request failed');
      }
      const bookingData = await res.json();
      const selectedSvcObj = services.find((s) => s.id === selectedService);
      const isFree = selectedSvcObj?.type === 'meet_greet' || selectedSvcObj?.price === 0;

      if (isFree) {
        navigate('/home');
        return;
      }

      // Initiate payment for paid bookings
      const bookingId = bookingData.id ?? bookingData.booking?.id;
      if (bookingId) {
        const totalPrice = calculateBookingPrice(selectedSvcObj!.price, selectedSvcObj!.additional_pet_price || 0, selectedPetIds.length);
        const totalCents = Math.round(totalPrice * 100);
        setPaymentAmount(totalCents);
        const result = await createIntent(bookingId);
        if (result.secret) {
          setShowPayment(true);
          return;
        }
        // Payment setup failed — show the specific error
        setBookingError(`Booking created but payment setup failed: ${result.error || 'unknown error'}. You can pay later from the Home page.`);
        return;
      } else {
        navigate('/home');
      }
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : 'Failed to create booking. Please try again.');
    } finally {
      setBookingLoading(false);
    }
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div></div>;
  if (!sitter) return (
    <div className="text-center py-12">
      {error ? (
        <div className="flex flex-col items-center gap-3">
          <AlertCircle className="w-8 h-8 text-red-400" />
          <p className="text-red-600">{error}</p>
        </div>
      ) : (
        <p className="text-stone-500">Sitter not found</p>
      )}
    </div>
  );

  return (
    <div>
      <SitterProfileHeader
        sitter={sitter}
        postCount={postCount}
        cityName={cityName}
        currentUser={user}
        isFavorited={isFavorited(sitter.id)}
        onToggleFavorite={toggleFavorite}
        onBookClick={scrollToBooking}
        onMessageClick={() => navigate(`/messages?recipient=${sitter.id}`)}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="grid lg:grid-cols-3 gap-12">
        {/* Left Column: Profile Content */}
        <div className="lg:col-span-2 space-y-8">

          {sitter.lat != null && sitter.lng != null && (
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-stone-100">
              <h2 className="text-xl font-bold mb-4 text-stone-900">Location</h2>
              <Suspense fallback={
                <div className="h-64 md:h-80 bg-stone-100 rounded-2xl flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
                </div>
              }>
                <SitterLocationMap
                  lat={sitter.lat}
                  lng={sitter.lng}
                  name={sitter.name}
                  serviceRadiusMiles={sitter.service_radius_miles}
                />
              </Suspense>
              <p className="text-xs text-stone-400 mt-3">
                {cityName ? `${cityName} — ` : ''}Approximate location shown for privacy
                {sitter.service_radius_miles && ` · Serves within ${sitter.service_radius_miles} miles`}
              </p>
            </div>
          )}

          {photos.length > 0 && (
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-stone-100">
              <h2 className="text-xl font-bold mb-4 text-stone-900">Photos</h2>
              <PhotoGallery photos={photos} />
            </div>
          )}

          <div className="bg-white p-8 rounded-2xl shadow-sm border border-stone-100">
            <h2 className="text-xl font-bold mb-6 text-stone-900">Reviews</h2>

            {/* Sub-rating breakdown bars */}
            {reviews.length > 0 && (
              <div className="mb-6 p-4 bg-stone-50 rounded-xl border border-stone-200">
                <SubRatingBars reviews={reviews} />
              </div>
            )}

            <div className="space-y-6">
              {reviews.map((review) => (
                <div key={review.id} className="border-b border-stone-100 pb-6 last:border-0 last:pb-0">
                  <div className="flex items-center gap-3 mb-2">
                    <img
                      src={review.reviewer_avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(review.reviewer_name ?? 'U')}`}
                      alt={review.reviewer_name ?? 'Reviewer'}
                      className="w-10 h-10 rounded-full"
                    />
                    <div>
                      <div className="font-bold text-stone-900">{review.reviewer_name}</div>
                      <div className="flex text-amber-400 text-xs">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} className={`w-3 h-3 ${i < review.rating ? 'fill-current' : 'text-stone-200'}`} />
                        ))}
                      </div>
                    </div>
                    <div className="ml-auto text-xs text-stone-400">
                      {new Date(review.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <SubRatingPills review={review} />
                  {review.comment && <p className="text-stone-600 text-sm mt-2">{review.comment}</p>}
                  {review.response_text && review.response_at && sitter && (
                    <ReviewResponse
                      responseText={review.response_text}
                      responseAt={review.response_at}
                      respondentName={sitter.name}
                    />
                  )}
                </div>
              ))}
              {reviews.length === 0 && importedReviews.length === 0 && (
                <p className="text-stone-500 italic">
                  {user ? 'No reviews yet.' : 'Log in to see reviews.'}
                </p>
              )}
            </div>

            {importedReviews.length > 0 && (
              <div className="mt-8 pt-6 border-t border-stone-200">
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

        {/* Right Column: Booking Card */}
        <div className="lg:col-span-1" ref={bookingRef}>
          <div className="bg-white p-6 rounded-2xl shadow-lg border border-stone-100 sticky top-24">
            <h3 className="text-xl font-bold mb-6 text-stone-900">Book {sitter.name}</h3>
            
            <div className="space-y-4 mb-6">
              <label className="block text-sm font-medium text-stone-700">Service</label>
              <div className="grid grid-cols-1 gap-2">
                {services.map((service) => (
                  <button
                    key={service.id}
                    onClick={() => setSelectedService(service.id)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      selectedService === service.id 
                        ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500' 
                        : 'border-stone-200 hover:border-emerald-200'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-stone-900 capitalize">{service.type.replace(/[-_]/g, ' ')}</span>
                      <span className="font-bold text-emerald-600">{service.price === 0 ? 'Free' : `$${service.price}`}</span>
                    </div>
                    <p className="text-xs text-stone-500 mt-1">{service.description}</p>
                    {(service.additional_pet_price || 0) > 0 && (
                      <p className="text-xs text-stone-400 mt-0.5">+${service.additional_pet_price}/extra pet</p>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4 mb-6">
              <label className="block text-sm font-medium text-stone-700">Date</label>
              <BookingCalendar
                sitterId={sitter.id}
                selectedDate={selectedDate}
                onDateSelect={handleDateSelect}
                onAvailabilityLoaded={handleAvailabilityLoaded}
              />
            </div>

            {selectedDate && (
              <div className="space-y-2 mb-6">
                <label className="block text-sm font-medium text-stone-700">Time</label>
                <TimeSlotPicker
                  selectedDate={selectedDate}
                  availability={availability}
                  selectedTime={selectedTime}
                  onTimeSelect={setSelectedTime}
                />
              </div>
            )}

            {user && pets.length > 0 && (
              <div className="space-y-2 mb-6">
                <label className="block text-sm font-medium text-stone-700">Your Pets</label>
                <PetSelector
                  pets={pets}
                  selectedPetIds={selectedPetIds}
                  onSelectionChange={setSelectedPetIds}
                />
              </div>
            )}

            {selectedPetIds.length > 0 && selectedService && (() => {
              const svc = services.find((s) => s.id === selectedService);
              if (!svc || svc.price === 0) return null;
              const total = calculateBookingPrice(svc.price, svc.additional_pet_price || 0, selectedPetIds.length);
              return (
                <div className="mb-6 p-3 bg-stone-50 rounded-xl space-y-1">
                  <div className="flex justify-between text-sm text-stone-600">
                    <span>Base price</span>
                    <span>${svc.price}</span>
                  </div>
                  {selectedPetIds.length > 1 && (svc.additional_pet_price || 0) > 0 && (
                    <div className="flex justify-between text-sm text-stone-600">
                      <span>{selectedPetIds.length - 1} extra pet{selectedPetIds.length > 2 ? 's' : ''} × ${svc.additional_pet_price}</span>
                      <span>${((selectedPetIds.length - 1) * (svc.additional_pet_price || 0)).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-bold text-stone-900 pt-1 border-t border-stone-200">
                    <span>Total</span>
                    <span>${total.toFixed(2)}</span>
                  </div>
                </div>
              );
            })()}

            {bookingError && (
              <div role="alert" className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="flex-grow">{bookingError}</span>
                <button onClick={() => setBookingError(null)} aria-label="Dismiss error" className="text-red-400 hover:text-red-600 font-medium">Dismiss</button>
              </div>
            )}

            <button
              onClick={handleBooking}
              disabled={bookingLoading || !selectedService || !selectedDate || !selectedTime || selectedPetIds.length === 0}
              className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {bookingLoading ? 'Submitting...' : selectedService && services.find((s) => s.id === selectedService)?.type === 'meet_greet' ? 'Request Booking' : 'Request Booking & Pay'}
            </button>
            
            <p className="text-xs text-center text-stone-400 mt-4">
              {selectedService && services.find((s) => s.id === selectedService)?.type === 'meet_greet'
                ? 'This is a free meet & greet — no payment required.'
                : 'You won\'t be charged until the sitter confirms.'}
            </p>

            {sitter.cancellation_policy && (
              <div className="mt-4 p-3 bg-stone-50 rounded-xl">
                <p className="text-xs font-medium text-stone-600 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Cancellation: <span className="capitalize">{sitter.cancellation_policy}</span>
                </p>
                <p className="text-xs text-stone-400 mt-1">
                  {getPolicyDescription(sitter.cancellation_policy)}
                </p>
              </div>
            )}

          </div>
        </div>
      </div>
      </div>

      {/* Payment Dialog */}
      <AlertDialog open={showPayment} onOpenChange={(open) => { if (!open) setShowPayment(false); }}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-emerald-600" />
              Complete Payment
            </AlertDialogTitle>
            <AlertDialogDescription>
              Your booking has been created. Complete payment to confirm.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {clientSecret && paymentAmount > 0 ? (
            <PaymentForm
              clientSecret={clientSecret}
              amount={paymentAmount}
              onSuccess={() => {
                setShowPayment(false);
                navigate('/home');
              }}
              onError={(msg) => setBookingError(msg)}
            />
          ) : paymentLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
            </div>
          ) : paymentError ? (
            <Alert variant="destructive">
              <AlertDescription>{paymentError}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setShowPayment(false);
              navigate('/home');
            }}>
              Pay Later
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
