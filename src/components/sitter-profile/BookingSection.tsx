import React, { useState, useCallback, useMemo, useEffect, lazy, Suspense } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { User, Pet, Service, Availability, SitterAddon } from '../../types';
import { getServiceLabel } from '../../shared/service-labels';
import { getAuthHeaders } from '../../context/AuthContext';
import { AlertCircle, CreditCard, ShieldCheck } from 'lucide-react';
import { API_BASE } from '../../config';
import BookingCalendar from '../booking/BookingCalendar';
import TimeSlotPicker from '../booking/TimeSlotPicker';
import PetSelector from '../booking/PetSelector';
import FirstBookingNudge from '../booking/FirstBookingNudge';
import InquiryForm from '../booking/InquiryForm';
import CameraInfoCard from '../booking/CameraInfoCard';
import PaymentForm from '../payment/PaymentForm';
import { usePaymentIntent } from '../../hooks/usePaymentIntent';
import { calculateAdvancedPrice, isUSHoliday, isPuppy } from '../../shared/pricing';
import { findApplicableTier } from '../../shared/loyalty-discount';
import { formatCents } from '../../lib/money';
import { getAddonBySlug } from '../../shared/addon-catalog';
import { getPolicyDescription } from '../../shared/cancellation';
import { Alert, AlertDescription } from '../ui/alert';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '../ui/alert-dialog';

const SitterLocationMap = lazy(() => import('../map/SitterLocationMap'));

export interface BookingSectionProps {
  sitter: User;
  services: Service[];
  sitterAddons: SitterAddon[];
  pets: Pet[];
  selectedPetIds: number[];
  onPetSelectionChange: (ids: number[]) => void;
  availability: Availability[];
  loyaltyInfo: { tiers: { min_bookings: number; discount_percent: number }[]; completed_bookings: number } | null;
  depositCredit: { booking_id: number; amount_cents: number } | null;
  isOwnProfile: boolean;
  user: User | null;
  token: string | null;
  cityName: string | null;
  bookingRef: React.RefObject<HTMLDivElement>;
  onAvailabilityLoaded: (data: Availability[]) => void;
  initialServiceId?: number | null;
}

export default function BookingSection({
  sitter,
  services,
  sitterAddons,
  pets,
  selectedPetIds,
  onPetSelectionChange,
  availability,
  loyaltyInfo,
  depositCredit,
  isOwnProfile,
  user,
  token,
  cityName,
  bookingRef,
  onAvailabilityLoaded,
  initialServiceId,
}: BookingSectionProps) {
  const navigate = useNavigate();

  // Booking-specific state
  const [selectedService, setSelectedService] = useState<number | null>(() => {
    const matched = initialServiceId && services.find(s => s.id === initialServiceId);
    return matched ? matched.id : services.length > 0 ? services[0].id : null;
  });
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [wantsPickup, setWantsPickup] = useState(false);
  const [wantsGrooming, setWantsGrooming] = useState(false);
  const [selectedAddonIds, setSelectedAddonIds] = useState<Set<number>>(new Set());
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [showInquiry, setShowInquiry] = useState(false);

  const { clientSecret, loading: paymentLoading, error: paymentError, createIntent } = usePaymentIntent();

  const handleDateSelect = useCallback((date: Date) => {
    setSelectedDate(date);
    setSelectedTime(null);
  }, []);

  // Filter booking services by selected pets' species
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

  // Clear add-on selections when switching service type
  useEffect(() => {
    setSelectedAddonIds(new Set());
  }, [selectedService]);

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
          sitter_id: sitter.id,
          service_id: selectedService,
          pet_ids: selectedPetIds,
          start_time: startDate.toISOString(),
          end_time: endDate.toISOString(),
          pickup_dropoff: wantsPickup,
          grooming_addon: wantsGrooming,
          addon_ids: [...selectedAddonIds],
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
        const selectedAddonList = sitterAddons.filter((a) => selectedAddonIds.has(a.id));
        const loyaltyTierForPayment = loyaltyInfo
          ? findApplicableTier(
              loyaltyInfo.tiers.map((t) => ({ sitter_id: sitter.id, ...t })),
              loyaltyInfo.completed_bookings
            )
          : null;
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
          addons: selectedAddonList.map((a) => ({ slug: a.addon_slug, priceCents: a.price_cents })),
          discountPercent: loyaltyTierForPayment?.discount_percent,
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

  const toggleAddon = useCallback((addonId: number) => {
    setSelectedAddonIds((prev) => {
      const next = new Set(prev);
      if (next.has(addonId)) {
        next.delete(addonId);
      } else {
        next.add(addonId);
      }
      return next;
    });
  }, []);

  return (
    <>
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

          {/* House Rules */}
          {sitter.house_rules && (
            <div className="bg-white rounded-2xl border border-stone-200 p-5">
              <h3 className="text-lg font-bold text-stone-900 mb-3">House Rules</h3>
              <p className="text-sm text-stone-600 whitespace-pre-line leading-relaxed">{sitter.house_rules}</p>
            </div>
          )}

          {/* Booking Card -- hidden on own profile */}
          {!isOwnProfile && (
          <div className="bg-white rounded-2xl border border-stone-200 p-6">
            <h3 className="text-xl font-bold mb-6 text-stone-900">Book {sitter.name}</h3>
            <FirstBookingNudge />

            {depositCredit && (
              <div className="mb-6 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                <span>You have a <strong>{formatCents(depositCredit.amount_cents)} credit</strong> from your meet & greet — it will be applied to your next booking!</span>
              </div>
            )}

            {user && !user.emergency_contact_name && (
              <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
                <Link to="/settings#section-account" className="font-semibold underline hover:text-amber-800">Add an emergency contact</Link> in your settings — sitters need someone to reach in case of a pet emergency.
              </div>
            )}

            {user && pets.length > 0 && (
              <div className="space-y-2 mb-6">
                <label className="block text-sm font-medium text-stone-700">Your Pets</label>
                <PetSelector
                  pets={pets}
                  selectedPetIds={selectedPetIds}
                  onSelectionChange={onPetSelectionChange}
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
                onAvailabilityLoaded={onAvailabilityLoaded}
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

              // Filter add-ons applicable to the selected service type
              const applicableAddons = sitterAddons.filter((a) => {
                const def = getAddonBySlug(a.addon_slug);
                return def && def.applicableServices.includes(svc.type as any);
              });

              const addonItems = sitterAddons
                .filter((a) => selectedAddonIds.has(a.id))
                .map((a) => ({ slug: a.addon_slug, priceCents: a.price_cents }));

              // Apply loyalty discount if applicable
              const loyaltyTier = loyaltyInfo
                ? findApplicableTier(
                    loyaltyInfo.tiers.map((t) => ({ sitter_id: sitter.id, ...t })),
                    loyaltyInfo.completed_bookings
                  )
                : null;

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
                addons: addonItems,
                discountPercent: loyaltyTier?.discount_percent,
                discountReason: loyaltyTier
                  ? `Loyalty: ${loyaltyTier.discount_percent}% off (${loyaltyInfo!.completed_bookings}+ bookings)`
                  : undefined,
              });

              return (
                <div className="mb-6 space-y-3">
                  {/* Add-ons -- dynamic from sitter's catalog */}
                  {(applicableAddons.length > 0 || svc.pickup_dropoff_fee_cents || svc.grooming_addon_fee_cents) && (
                    <div className="p-3 bg-white border border-stone-200 rounded-xl space-y-2">
                      <div className="text-xs font-bold text-stone-500 uppercase tracking-wider">Add-ons</div>
                      {/* Legacy add-ons (backward compat until fully migrated) */}
                      {svc.pickup_dropoff_fee_cents != null && svc.pickup_dropoff_fee_cents > 0 && !applicableAddons.some((a) => a.addon_slug === 'pickup_dropoff') && (
                        <label className="flex items-center justify-between cursor-pointer text-sm">
                          <span className="flex items-center gap-2">
                            <input type="checkbox" checked={wantsPickup} onChange={(e) => setWantsPickup(e.target.checked)} className="rounded text-emerald-600" />
                            Pickup & drop-off
                          </span>
                          <span className="text-stone-500">+{formatCents(svc.pickup_dropoff_fee_cents)}</span>
                        </label>
                      )}
                      {svc.grooming_addon_fee_cents != null && svc.grooming_addon_fee_cents > 0 && !applicableAddons.some((a) => a.addon_slug === 'full_grooming') && (
                        <label className="flex items-center justify-between cursor-pointer text-sm">
                          <span className="flex items-center gap-2">
                            <input type="checkbox" checked={wantsGrooming} onChange={(e) => setWantsGrooming(e.target.checked)} className="rounded text-emerald-600" />
                            Grooming add-on
                          </span>
                          <span className="text-stone-500">+{formatCents(svc.grooming_addon_fee_cents)}</span>
                        </label>
                      )}
                      {/* New catalog add-ons */}
                      {applicableAddons.map((addon) => {
                        const def = getAddonBySlug(addon.addon_slug);
                        const isSelected = selectedAddonIds.has(addon.id);
                        return (
                          <label
                            key={addon.id}
                            className={`flex items-center justify-between cursor-pointer text-sm p-2 rounded-lg transition-colors ${
                              isSelected ? 'bg-emerald-50 border border-emerald-200' : 'hover:bg-stone-50'
                            }`}
                          >
                            <span className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleAddon(addon.id)}
                                className="rounded text-emerald-600 flex-shrink-0"
                              />
                              <span className="min-w-0">
                                <span className="text-stone-800">{def?.emoji} {def?.label ?? addon.addon_slug}</span>
                                {addon.notes && (
                                  <span className="block text-xs text-stone-400 mt-0.5 truncate">{addon.notes}</span>
                                )}
                              </span>
                            </span>
                            <span className={`whitespace-nowrap ml-2 ${isSelected ? 'text-emerald-700 font-medium' : 'text-stone-400'}`}>
                              {addon.price_cents === 0 ? 'Free' : `+${formatCents(addon.price_cents)}`}
                            </span>
                          </label>
                        );
                      })}
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
                    {pricing.breakdown.addonDetails.map((a) => {
                      const addonDef = getAddonBySlug(a.slug);
                      return (
                        <div key={a.slug} className="flex justify-between text-sm text-stone-600">
                          <span>{addonDef?.emoji} {addonDef?.label ?? a.slug}</span>
                          <span>{a.priceCents === 0 ? 'Free' : formatCents(a.priceCents)}</span>
                        </div>
                      );
                    })}
                    {pricing.breakdown.discountCents > 0 && (
                      <div className="flex justify-between text-sm text-emerald-600">
                        <span>Loyalty discount ({pricing.breakdown.discountPercent}%)</span>
                        <span>-{formatCents(pricing.breakdown.discountCents)}</span>
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

            {/* Camera & Monitoring info -- shown during booking flow */}
            {sitter && (sitter.camera_preference === 'requires' || sitter.camera_preference === 'prefers') && (
              <CameraInfoCard
                sitterCameraPreference={sitter.camera_preference}
                viewAs="owner"
              />
            )}

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

            <button
              onClick={() => setShowInquiry(true)}
              className="w-full mt-3 border border-emerald-600 text-emerald-700 py-3 rounded-xl font-bold hover:bg-emerald-50 transition-colors"
            >
              Send Inquiry
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

      {/* Inquiry Dialog */}
      <InquiryForm
        open={showInquiry}
        onOpenChange={setShowInquiry}
        sitterId={sitter.id}
        sitterName={sitter.name}
        services={services}
        pets={pets}
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
    </>
  );
}
