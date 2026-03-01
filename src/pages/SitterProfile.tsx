import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { User, Service, Review, Availability, SitterPhoto } from '../types';
import { useAuth, getAuthHeaders } from '../context/AuthContext';
import { MapPin, Star, MessageSquare, ShieldCheck, AlertCircle } from 'lucide-react';
import { API_BASE } from '../config';
import BookingCalendar from '../components/BookingCalendar';
import TimeSlotPicker from '../components/TimeSlotPicker';
import PhotoGallery from '../components/PhotoGallery';
import { useFavorites } from '../hooks/useFavorites';
import FavoriteButton from '../components/FavoriteButton';

export default function SitterProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, token } = useAuth();
  const { isFavorited, toggleFavorite } = useFavorites();
  const [sitter, setSitter] = useState<User | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [photos, setPhotos] = useState<SitterPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedService, setSelectedService] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [bookingError, setBookingError] = useState<string | null>(null);

  const handleAvailabilityLoaded = useCallback((data: Availability[]) => {
    setAvailability(data);
  }, []);

  const handleDateSelect = useCallback((date: Date) => {
    setSelectedDate(date);
    setSelectedTime(null);
  }, []);

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
        const rebookServiceId = Number(searchParams.get('serviceId'));
        const matchedService = rebookServiceId && data.services.find((s: Service) => s.id === rebookServiceId);
        setSelectedService(matchedService ? matchedService.id : data.services.length > 0 ? data.services[0].id : null);
      } catch {
        setError('Failed to load sitter profile.');
      } finally {
        setLoading(false);
      }
    };
    fetchSitter();
  }, [id]);

  const handleBooking = async () => {
    if (!user) {
      navigate('/login');
      return;
    }

    if (!selectedService || !selectedDate || !selectedTime) return;
    setBookingError(null);

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
          start_time: startDate.toISOString(),
          end_time: endDate.toISOString(),
        })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Booking request failed');
      }
      navigate('/dashboard');
    } catch (err) {
      setBookingError(err instanceof Error ? err.message : 'Failed to create booking. Please try again.');
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="grid lg:grid-cols-3 gap-12">
        {/* Left Column: Profile Info */}
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-stone-100">
            <div className="flex items-start gap-6">
              <img 
                src={sitter.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(sitter.name)}`} 
                alt={sitter.name} 
                className="w-24 h-24 rounded-full object-cover border-4 border-emerald-50"
              />
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-3xl font-bold text-stone-900">{sitter.name}</h1>
                  {user && user.id !== sitter.id && (
                    <FavoriteButton
                      sitterId={sitter.id}
                      isFavorited={isFavorited(sitter.id)}
                      onToggle={toggleFavorite}
                    />
                  )}
                </div>
                <div className="flex items-center text-stone-500 mt-2">
                  <MapPin className="w-4 h-4 mr-1" />
                  <span>San Francisco, CA</span>
                </div>
                <div className="flex items-center gap-4 mt-4 text-sm font-medium">
                  <div className="flex items-center gap-1 text-amber-500 bg-amber-50 px-3 py-1 rounded-full">
                    <Star className="w-4 h-4 fill-current" />
                    <span>5.0 (12 reviews)</span>
                  </div>
                  <div className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Identity Verified</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <h2 className="text-xl font-bold mb-4 text-stone-900">About {sitter.name}</h2>
              <p className="text-stone-600 leading-relaxed">{sitter.bio}</p>
              {sitter.accepted_pet_sizes && sitter.accepted_pet_sizes.length > 0 && (
                <div className="mt-4 flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-stone-500">Accepts:</span>
                  {sitter.accepted_pet_sizes.map((size) => (
                    <span key={size} className="bg-stone-100 text-stone-600 text-xs px-2 py-1 rounded-full capitalize">{size}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {photos.length > 0 && (
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-stone-100">
              <h2 className="text-xl font-bold mb-4 text-stone-900">Photos</h2>
              <PhotoGallery photos={photos} />
            </div>
          )}

          <div className="bg-white p-8 rounded-2xl shadow-sm border border-stone-100">
            <h2 className="text-xl font-bold mb-6 text-stone-900">Reviews</h2>
            <div className="space-y-6">
              {reviews.map((review) => (
                <div key={review.id} className="border-b border-stone-100 pb-6 last:border-0 last:pb-0">
                  <div className="flex items-center gap-3 mb-2">
                    <img 
                      src={review.reviewer_avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(review.reviewer_name)}`} 
                      alt={review.reviewer_name} 
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
                  <p className="text-stone-600 text-sm">{review.comment}</p>
                </div>
              ))}
              {reviews.length === 0 && <p className="text-stone-500 italic">No reviews yet.</p>}
            </div>
          </div>
        </div>

        {/* Right Column: Booking Card */}
        <div className="lg:col-span-1">
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

            {bookingError && (
              <div role="alert" className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-xs">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span className="flex-grow">{bookingError}</span>
                <button onClick={() => setBookingError(null)} className="text-red-400 hover:text-red-600 font-medium">Dismiss</button>
              </div>
            )}

            <button
              onClick={handleBooking}
              disabled={!selectedService || !selectedDate || !selectedTime}
              className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Request Booking
            </button>
            
            <p className="text-xs text-center text-stone-400 mt-4">
              You won't be charged until the sitter confirms.
            </p>

            {sitter.cancellation_policy && (
              <div className="mt-4 p-3 bg-stone-50 rounded-xl">
                <p className="text-xs font-medium text-stone-600 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Cancellation: <span className="capitalize">{sitter.cancellation_policy}</span>
                </p>
                <p className="text-xs text-stone-400 mt-1">
                  {sitter.cancellation_policy === 'flexible' && 'Full refund if cancelled 24+ hours before.'}
                  {sitter.cancellation_policy === 'moderate' && '50% refund if cancelled 48+ hours before.'}
                  {sitter.cancellation_policy === 'strict' && 'No refund within 7 days of booking.'}
                </p>
              </div>
            )}

            <div className="mt-6 pt-6 border-t border-stone-100 text-center">
              <button 
                onClick={() => navigate(`/messages?recipient=${sitter.id}`)}
                className="text-emerald-600 font-medium hover:text-emerald-700 flex items-center justify-center gap-2 mx-auto"
              >
                <MessageSquare className="w-4 h-4" />
                Message {sitter.name}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
