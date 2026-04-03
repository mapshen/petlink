import React, { useEffect, useState, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { User, Pet, Service, Review, Availability, SitterPhoto, ImportedReview, SitterSpeciesProfile, ProfileMember } from '../../types';
import { getServiceLabel } from '../../shared/service-labels';
import ImportedReviewBadge from '../../components/profile/ImportedReviewBadge';
import SubRatingBars from '../../components/review/SubRatingBars';
import SubRatingPills from '../../components/review/SubRatingPills';
import ReviewResponse from '../../components/review/ReviewResponse';
import SitterProfileHeader from '../../components/sitter-profile/SitterProfileHeader';
import ServiceHighlights from '../../components/sitter-profile/ServiceHighlights';
import ProfileTabs, { type TabId } from '../../components/sitter-profile/ProfileTabs';
import SpeciesDetails from '../../components/sitter-profile/SpeciesDetails';
import PostsGrid from '../../components/sitter-profile/PostsGrid';
import CreatePostDialog from '../../components/sitter-profile/CreatePostDialog';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { Star, AlertCircle, CreditCard, ShieldCheck, ImagePlus } from 'lucide-react';
import { API_BASE } from '../../config';
import { reverseGeocode } from '../../lib/geo';

const SitterLocationMap = lazy(() => import('../../components/map/SitterLocationMap'));
import BookingCalendar from '../../components/booking/BookingCalendar';
import TimeSlotPicker from '../../components/booking/TimeSlotPicker';
import PetSelector from '../../components/booking/PetSelector';
import { useFavorites } from '../../hooks/useFavorites';
import PaymentForm from '../../components/payment/PaymentForm';
import { usePaymentIntent } from '../../hooks/usePaymentIntent';
import { calculateBookingPrice, calculateAdvancedPrice, isUSHoliday, isPuppy } from '../../shared/pricing';
import { formatCents, formatCentsDecimal } from '../../lib/money';
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
  const [importedReviews, setImportedReviews] = useState<ImportedReview[]>([]);
  const [profileMembers, setProfileMembers] = useState<ProfileMember[]>([]);
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
  const [speciesProfiles, setSpeciesProfiles] = useState<SitterSpeciesProfile[]>([]);
  const [postCount, setPostCount] = useState(0);
  const [activeTab, setActiveTab] = useState<TabId>('posts');
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [postsKey, setPostsKey] = useState(0);
  const [wantsPickup, setWantsPickup] = useState(false);
  const [wantsGrooming, setWantsGrooming] = useState(false);
  const bookingRef = useRef<HTMLDivElement>(null);

  const scrollToBooking = useCallback(() => {
    setActiveTab('availability');
    setTimeout(() => {
      bookingRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

  const handleAvailabilityLoaded = useCallback((data: Availability[]) => {
    setAvailability(data);
  }, []);

  const handleDateSelect = useCallback((date: Date) => {
    setSelectedDate(date);
    setSelectedTime(null);
  }, []);

  // Track profile view once per sitter load
  const viewTrackedRef = useRef(false);
  useEffect(() => { viewTrackedRef.current = false; }, [id]);
  useEffect(() => {
    if (!sitter || viewTrackedRef.current) return;
    viewTrackedRef.current = true;

    const fromParam = new URLSearchParams(window.location.search).get('from');
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
  }, [sitter]);

  useEffect(() => {
    const fetchSitter = async () => {
      try {
        const res = await fetch(`${API_BASE}/sitters/${id}`);
        if (!res.ok) throw new Error('Sitter not found');
        const data = await res.json();
        setSitter(data.sitter);
        setServices(data.services);
        setReviews(data.reviews);
        setImportedReviews(data.imported_reviews || []);
        setProfileMembers(data.profile_members || []);
        const rebookServiceId = Number(serviceIdParam);
        const matchedService = rebookServiceId && data.services.find((s: Service) => s.id === rebookServiceId);
        setSelectedService(matchedService ? matchedService.id : data.services.length > 0 ? data.services[0].id : null);

        // Fetch species profiles before clearing loading state to avoid tab flash
        try {
          const spRes = await fetch(`${API_BASE}/species-profiles/${data.sitter.id}`);
          if (spRes.ok) {
            const spData = await spRes.json();
            const profiles = spData.profiles || [];
            setSpeciesProfiles(profiles);
            if (profiles.length > 0) {
              setActiveTab(`species-${profiles[0].species}`);
            }
          }
        } catch {
          // Non-critical — species details just won't appear
        }
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

  const isOwnProfile = user != null && user.id === sitter?.id;
  const speciesTabs = speciesProfiles.map((p) => p.species);
  const selectedSpecies = activeTab.startsWith('species-') ? activeTab.replace('species-', '') : null;
  const selectedSpeciesProfile = selectedSpecies ? speciesProfiles.find((p) => p.species === selectedSpecies) : null;

  // Filter booking services by selected pets' species (memoized to avoid useEffect churn)
  const selectedPetSpecies: string[] = useMemo(
    () => [...new Set(pets.filter((p) => selectedPetIds.includes(p.id)).map((p) => p.species as string))],
    [pets, selectedPetIds]
  );
  const bookingServices = useMemo(
    () => selectedPetSpecies.length > 0
      ? services.filter((s) => !s.species || selectedPetSpecies.includes(s.species))
      : services,
    [services, selectedPetSpecies]
  );

  // Reset selected service if it's no longer in the filtered list
  useEffect(() => {
    if (selectedService && !bookingServices.find((s) => s.id === selectedService)) {
      setSelectedService(bookingServices.length > 0 ? bookingServices[0].id : null);
    }
  }, [bookingServices, selectedService]);

  const handleBooking = async () => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (isOwnProfile) return;

    if (!selectedService || !selectedDate || !selectedTime || selectedPetIds.length === 0) return;
    setBookingError(null);
    setBookingLoading(true);

    try {
      const [hours, minutes] = selectedTime.split(':').map(Number);
      const startDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate(), hours, minutes, 0, 0);
      const selectedSvc = services.find((s) => s.id === selectedService);
      const meetGreetMinutes = (selectedSvc?.service_details as Record<string, unknown>)?.duration_minutes as number | undefined;
      const durationMs = selectedSvc?.type === 'meet_greet'
        ? (meetGreetMinutes || 30) * 60 * 1000
        : 3600000;
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
          pickup_dropoff: wantsPickup,
          grooming_addon: wantsGrooming,
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Booking request failed');
      }
      const bookingData = await res.json();
      const selectedSvcObj = services.find((s) => s.id === selectedService);
      const isFree = selectedSvcObj?.price_cents === 0;

      if (isFree) {
        navigate('/home');
        return;
      }

      const bookingId = bookingData.id ?? bookingData.booking?.id;
      if (bookingId) {
        const selectedPetsForPrice = pets.filter((p) => selectedPetIds.includes(p.id));
        const pricing = calculateAdvancedPrice({
          basePriceCents: selectedSvcObj!.price_cents,
          additionalPetPriceCents: selectedSvcObj!.additional_pet_price_cents || 0,
          petCount: selectedPetIds.length,
          isHoliday: selectedDate ? isUSHoliday(selectedDate) : false,
          holidayRateCents: selectedSvcObj!.holiday_rate_cents,
          hasPuppy: selectedPetsForPrice.some((p) => isPuppy(p.age)),
          puppyRateCents: selectedSvcObj!.puppy_rate_cents,
          pickupDropoff: wantsPickup,
          pickupDropoffFeeCents: selectedSvcObj!.pickup_dropoff_fee_cents,
          groomingAddon: wantsGrooming,
          groomingAddonFeeCents: selectedSvcObj!.grooming_addon_fee_cents,
        });
        const totalCents = pricing.totalCents;
        setPaymentAmount(totalCents);
        const result = await createIntent(bookingId);
        if (result.secret) {
          setShowPayment(true);
          return;
        }
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
        speciesProfiles={speciesProfiles}
        profileMembers={profileMembers}
      />

      <ServiceHighlights
        services={services}
        selectedSpecies={selectedSpecies}
        onServiceClick={(service) => {
          setSelectedService(service.id);
          scrollToBooking();
        }}
      />

      <ProfileTabs activeTab={activeTab} onTabChange={setActiveTab} speciesTabs={speciesTabs} />

      {/* Tab Content */}
      <div className="max-w-[960px] mx-auto">
        {/* Species Tab */}
        {selectedSpeciesProfile && (
          <SpeciesDetails profile={selectedSpeciesProfile} services={services} />
        )}

        {/* Posts Tab */}
        {activeTab === 'posts' && (
          <div role="tabpanel" aria-label="Posts">
            {user && user.id === sitter.id && user.roles?.includes('sitter') && (
              <div className="flex justify-end px-4 py-3">
                <button
                  onClick={() => setShowCreatePost(true)}
                  className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors flex items-center gap-1.5"
                >
                  <ImagePlus className="w-4 h-4" />
                  New Post
                </button>
              </div>
            )}
            <PostsGrid key={`${sitter.id}-${postsKey}`} sitterId={sitter.id} onTotalLoaded={setPostCount} />
          </div>
        )}

        {/* Reviews Tab */}
        {activeTab === 'reviews' && (
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
                  </div>
                ))}
                {reviews.length === 0 && importedReviews.length === 0 && (
                  <div className="p-8 text-center">
                    <p className="text-stone-500 italic">
                      {user ? 'No reviews yet.' : 'Log in to see reviews.'}
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
        )}

        {/* Availability Tab */}
        {activeTab === 'availability' && (
          <div className="py-6 px-4" ref={bookingRef} role="tabpanel" aria-label="Availability">
            <div className="max-w-2xl mx-auto space-y-6">
              {/* Location */}
              {sitter.lat != null && sitter.lng != null && (
                <div className="bg-white rounded-2xl border border-stone-200 p-5">
                  <h3 className="text-lg font-bold text-stone-900 mb-3">Location</h3>
                  <Suspense fallback={
                    <div className="h-48 bg-stone-100 rounded-xl flex items-center justify-center">
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
                  <p className="text-xs text-stone-400 mt-2">
                    {cityName ? `${cityName} — ` : ''}Approximate location shown for privacy
                    {sitter.service_radius_miles && ` · Serves within ${sitter.service_radius_miles} miles`}
                  </p>
                </div>
              )}

              {/* Booking Card — hidden on own profile */}
              {!isOwnProfile && (
              <div className="bg-white rounded-2xl border border-stone-200 p-6">
                <h3 className="text-xl font-bold mb-6 text-stone-900">Book {sitter.name}</h3>

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
                {user && pets.length === 0 && (
                  <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
                    <Link to="/profile#section-pets" className="font-semibold underline hover:text-amber-800">Add a pet to your profile</Link> before booking.
                  </div>
                )}

                <div className="space-y-4 mb-6">
                  <label className="block text-sm font-medium text-stone-700">Service</label>
                  <div className="grid grid-cols-1 gap-2">
                    {bookingServices.map((service) => (
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
                          <span className="font-medium text-stone-900">
                            {getServiceLabel(service.type, service.species ? [service.species] : undefined)}
                          </span>
                          <span className="font-bold text-emerald-600">{service.price_cents === 0 ? 'Free' : formatCents(service.price_cents)}</span>
                        </div>
                        <p className="text-xs text-stone-500 mt-1">{service.description}</p>
                        {(service.additional_pet_price_cents || 0) > 0 && (
                          <p className="text-xs text-stone-400 mt-0.5">+{formatCents(service.additional_pet_price_cents!)}/extra pet</p>
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

                {selectedPetIds.length > 0 && selectedService && (() => {
                  const svc = bookingServices.find((s) => s.id === selectedService);
                  if (!svc || svc.price_cents === 0) return null;
                  const selectedPets = pets.filter((p) => selectedPetIds.includes(p.id));
                  const hasPuppyPet = selectedPets.some((p) => isPuppy(p.age));
                  const holidayDate = selectedDate ? isUSHoliday(selectedDate) : false;
                  const pricing = calculateAdvancedPrice({
                    basePriceCents: svc.price_cents,
                    additionalPetPriceCents: svc.additional_pet_price_cents || 0,
                    petCount: selectedPetIds.length,
                    isHoliday: holidayDate,
                    holidayRateCents: svc.holiday_rate_cents,
                    hasPuppy: hasPuppyPet,
                    puppyRateCents: svc.puppy_rate_cents,
                    pickupDropoff: wantsPickup,
                    pickupDropoffFeeCents: svc.pickup_dropoff_fee_cents,
                    groomingAddon: wantsGrooming,
                    groomingAddonFeeCents: svc.grooming_addon_fee_cents,
                  });
                  return (
                    <div className="mb-6 space-y-3">
                      {/* Add-ons */}
                      {(svc.pickup_dropoff_fee_cents || svc.grooming_addon_fee_cents) && (
                        <div className="p-3 bg-white border border-stone-200 rounded-xl space-y-2">
                          <div className="text-xs font-bold text-stone-500 uppercase tracking-wider">Add-ons</div>
                          {svc.pickup_dropoff_fee_cents != null && svc.pickup_dropoff_fee_cents > 0 && (
                            <label className="flex items-center justify-between cursor-pointer text-sm">
                              <span className="flex items-center gap-2">
                                <input type="checkbox" checked={wantsPickup} onChange={(e) => setWantsPickup(e.target.checked)} className="rounded text-emerald-600" />
                                Pickup & drop-off
                              </span>
                              <span className="text-stone-500">+{formatCents(svc.pickup_dropoff_fee_cents)}</span>
                            </label>
                          )}
                          {svc.grooming_addon_fee_cents != null && svc.grooming_addon_fee_cents > 0 && (
                            <label className="flex items-center justify-between cursor-pointer text-sm">
                              <span className="flex items-center gap-2">
                                <input type="checkbox" checked={wantsGrooming} onChange={(e) => setWantsGrooming(e.target.checked)} className="rounded text-emerald-600" />
                                Grooming add-on
                              </span>
                              <span className="text-stone-500">+{formatCents(svc.grooming_addon_fee_cents)}</span>
                            </label>
                          )}
                        </div>
                      )}

                      {/* Price breakdown */}
                      <div className="p-3 bg-stone-50 rounded-xl space-y-1">
                        <div className="flex justify-between text-sm text-stone-600">
                          <span>
                            {pricing.breakdown.holidayApplied ? 'Holiday rate' : pricing.breakdown.puppyApplied ? 'Puppy/kitten rate' : 'Base price'}
                          </span>
                          <span>{formatCents(pricing.breakdown.baseCents)}</span>
                        </div>
                        {pricing.breakdown.extraPetsCents > 0 && (
                          <div className="flex justify-between text-sm text-stone-600">
                            <span>{selectedPetIds.length - 1} extra pet{selectedPetIds.length > 2 ? 's' : ''}</span>
                            <span>{formatCents(pricing.breakdown.extraPetsCents)}</span>
                          </div>
                        )}
                        {pricing.breakdown.pickupDropoffCents > 0 && (
                          <div className="flex justify-between text-sm text-stone-600">
                            <span>Pickup & drop-off</span>
                            <span>{formatCents(pricing.breakdown.pickupDropoffCents)}</span>
                          </div>
                        )}
                        {pricing.breakdown.groomingCents > 0 && (
                          <div className="flex justify-between text-sm text-stone-600">
                            <span>Grooming add-on</span>
                            <span>{formatCents(pricing.breakdown.groomingCents)}</span>
                          </div>
                        )}
                        <div className="flex justify-between text-sm font-bold text-stone-900 pt-1 border-t border-stone-200">
                          <span>Total</span>
                          <span>{formatCents(pricing.totalCents)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {bookingError && (
                  <div role="alert" className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs mb-4">
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
                  {bookingLoading ? 'Submitting...' : selectedService && services.find((s) => s.id === selectedService)?.price_cents === 0 ? 'Request Booking' : 'Request Booking & Pay'}
                </button>

                <p className="text-xs text-center text-stone-400 mt-4">
                  {selectedService && services.find((s) => s.id === selectedService)?.price_cents === 0
                    ? 'This is a free service — no payment required.'
                    : 'You won\'t be charged until the sitter confirms.'}
                </p>
                <p className="text-xs text-center text-stone-400 mt-1">
                  Times shown in your local timezone ({Intl.DateTimeFormat().resolvedOptions().timeZone})
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
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create Post Dialog */}
      <CreatePostDialog
        open={showCreatePost}
        onOpenChange={setShowCreatePost}
        onPostCreated={() => setPostsKey((k) => k + 1)}
      />

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
