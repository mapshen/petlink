import React, { useEffect, useState, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { useEditableProfile } from '../../hooks/useEditableProfile';
import EditableSection from '../../components/sitter-profile/EditableSection';
import OwnerInsightsStrip from '../../components/sitter-profile/OwnerInsightsStrip';
import SitterProfileStrengthBar from '../../components/sitter-profile/SitterProfileStrengthBar';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { User, Pet, Service, Review, Availability, SitterPhoto, ImportedReview, SitterSpeciesProfile, ProfileMember, SitterAddon } from '../../types';
import SitterProfileHeader from '../../components/sitter-profile/SitterProfileHeader';
import ServiceHighlights from '../../components/sitter-profile/ServiceHighlights';
import ProfileTabs, { type TabId } from '../../components/sitter-profile/ProfileTabs';
import SpeciesDetails from '../../components/sitter-profile/SpeciesDetails';
import PostsGrid from '../../components/sitter-profile/PostsGrid';
import CreatePostDialog from '../../components/sitter-profile/CreatePostDialog';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { AlertCircle, ImagePlus } from 'lucide-react';
import ReportReviewDialog from '../../components/review/ReportReviewDialog';
import ReviewsSection from '../../components/sitter-profile/ReviewsSection';
import BookingSection from '../../components/sitter-profile/BookingSection';
import { API_BASE } from '../../config';
import { reverseGeocode } from '../../lib/geo';

const ProfileTab = lazy(() => import('../profile/ProfileTab'));
const SpeciesProfilesTab = lazy(() => import('../profile/SpeciesProfilesTab'));
import { useFavorites } from '../../hooks/useFavorites';
import { useTurnstile } from '../../hooks/useTurnstile';
import TurnstileWidget from '../../components/auth/TurnstileWidget';

export default function SitterProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const serviceIdParam = new URLSearchParams(window.location.search).get('serviceId');
  const { user, token } = useAuth();
  const { token: turnstileToken, containerRef: turnstileRef } = useTurnstile({
    siteKey: import.meta.env.VITE_TURNSTILE_SITE_KEY,
  });
  const { isFavorited, toggleFavorite } = useFavorites();
  const [sitter, setSitter] = useState<User | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [importedReviews, setImportedReviews] = useState<ImportedReview[]>([]);
  const [profileMembers, setProfileMembers] = useState<ProfileMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pets, setPets] = useState<Pet[]>([]);
  const [selectedPetIds, setSelectedPetIds] = useState<number[]>([]);
  const [cityName, setCityName] = useState<string | null>(null);
  const [speciesProfiles, setSpeciesProfiles] = useState<SitterSpeciesProfile[]>([]);
  const [postCount, setPostCount] = useState(0);
  const [activeTab, setActiveTab] = useState<TabId>('posts');
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [reportingReviewId, setReportingReviewId] = useState<number | null>(null);
  const [postsKey, setPostsKey] = useState(0);
  const [sitterAddons, setSitterAddons] = useState<SitterAddon[]>([]);
  const [sitterPhotos, setSitterPhotos] = useState<SitterPhoto[]>([]);
  const [depositCredit, setDepositCredit] = useState<{ booking_id: number; amount_cents: number } | null>(null);
  const [loyaltyInfo, setLoyaltyInfo] = useState<{ tiers: { min_bookings: number; discount_percent: number }[]; completed_bookings: number } | null>(null);
  const [highlightServiceId, setHighlightServiceId] = useState<number | null>(null);
  const bookingRef = useRef<HTMLDivElement>(null);

  const scrollToBooking = useCallback(() => {
    setActiveTab('booking');
    setTimeout(() => {
      bookingRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

  const handleAvailabilityLoaded = useCallback((data: Availability[]) => {
    setAvailability(data);
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
        const fetchHeaders: Record<string, string> = {};
        if (turnstileToken) {
          fetchHeaders['cf-turnstile-response'] = turnstileToken;
        }
        if (token) {
          fetchHeaders['Authorization'] = `Bearer ${token}`;
        }
        const res = await fetch(`${API_BASE}/sitters/${id}`, { headers: fetchHeaders });
        if (!res.ok) throw new Error('Sitter not found');
        const data = await res.json();
        setSitter(data.sitter);
        setServices(data.services);
        setReviews(data.reviews);
        setImportedReviews(data.imported_reviews || []);
        setProfileMembers(data.profile_members || []);
        setSitterAddons(data.addons || []);

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
  }, [id, serviceIdParam, turnstileToken, token]);

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
    if (!sitterId) return;
    fetch(`${API_BASE}/sitter-photos/${sitterId}`)
      .then(r => r.ok ? r.json() : { photos: [] })
      .then(data => setSitterPhotos(data.photos || []))
      .catch(() => {});
  }, [sitterId]);

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

  // Fetch available deposit credit with this sitter
  useEffect(() => {
    setDepositCredit(null);
    if (!user || !sitter || !token) return;
    fetch(`${API_BASE}/bookings/available-credit/${sitter.id}`, { headers: getAuthHeaders(token) })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.credit) setDepositCredit(data.credit); })
      .catch(() => {});
  }, [user, sitter, token]);

  // Fetch loyalty discount tiers for this sitter
  useEffect(() => {
    setLoyaltyInfo(null);
    if (!user || !sitter || !token) return;
    fetch(`${API_BASE}/loyalty-discounts/sitter/${sitter.id}`, { headers: getAuthHeaders(token) })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setLoyaltyInfo(data); })
      .catch(() => {});
  }, [user, sitter, token]);

  const isOwnProfile = user != null && user.id === sitter?.id;
  const { editingSection, viewAsVisitor, startEditing, stopEditing, toggleViewAsVisitor } = useEditableProfile();
  const showEditMode = isOwnProfile && !viewAsVisitor;
  const speciesTabs = speciesProfiles.map((p) => p.species);
  const selectedSpecies = activeTab.startsWith('species-') ? activeTab.replace('species-', '') : null;
  const selectedSpeciesProfile = selectedSpecies ? speciesProfiles.find((p) => p.species === selectedSpecies) : null;

  const handleTabChange = useCallback((tab: TabId) => {
    setActiveTab(tab);
    setHighlightServiceId(null);
  }, []);

  const editPropsValue = useMemo(() => isOwnProfile ? {
    isOwner: isOwnProfile,
    editingSection,
    viewAsVisitor,
    onEdit: startEditing,
    onClose: stopEditing,
  } : undefined, [isOwnProfile, editingSection, viewAsVisitor, startEditing, stopEditing]);

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
      <TurnstileWidget containerRef={turnstileRef} />
      {/* Owner-only: Profile Strength + Insights */}
      {showEditMode && (
        <div className="max-w-[960px] mx-auto px-4 pt-6">
          <SitterProfileStrengthBar
            user={sitter}
            services={services}
            photos={sitterPhotos}
            onEditSection={startEditing}
          />
          <OwnerInsightsStrip token={token} />
        </div>
      )}

      <EditableSection
        sectionId="header"
        isOwner={isOwnProfile}
        isEditing={editingSection === 'header'}
        viewAsVisitor={viewAsVisitor}
        onEdit={startEditing}
        onClose={stopEditing}
        editContent={
          <Suspense fallback={<div className="h-32 flex items-center justify-center"><div className="animate-spin w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full" /></div>}>
            <ProfileTab />
          </Suspense>
        }
      >
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
          isOwner={isOwnProfile}
          viewAsVisitor={viewAsVisitor}
          onToggleViewMode={toggleViewAsVisitor}
        />
      </EditableSection>

      {/* Service Highlights — IG story circles above tabs */}
      <EditableSection
        sectionId="services"
        isOwner={isOwnProfile}
        isEditing={editingSection === 'services'}
        viewAsVisitor={viewAsVisitor}
        onEdit={startEditing}
        onClose={stopEditing}
        editContent={
          <Suspense fallback={<div className="h-32 flex items-center justify-center"><div className="animate-spin w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full" /></div>}>
            <SpeciesProfilesTab />
          </Suspense>
        }
      >
        <div className="bg-white border-b border-stone-200 px-6 py-4">
          <div className="max-w-[960px] mx-auto">
            <ServiceHighlights
              services={services}
              selectedSpecies={selectedSpecies}
              onServiceClick={(service) => {
                setHighlightServiceId(service.id);
                setActiveTab('booking');
                setTimeout(() => bookingRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
              }}
              showAddButton={showEditMode}
              onAddClick={() => startEditing('services')}
            />
          </div>
        </div>
      </EditableSection>

      <ProfileTabs activeTab={activeTab} onTabChange={handleTabChange} speciesTabs={speciesTabs} />

      {/* Tab Content */}
      <div className="max-w-[960px] mx-auto">
        {/* Species Tab */}
        {selectedSpeciesProfile && (
          <SpeciesDetails
            profile={selectedSpeciesProfile}
            services={services}
            sitterAddons={sitterAddons}
            editProps={editPropsValue}
          />
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
          <ReviewsSection
            sitter={sitter}
            reviews={reviews}
            importedReviews={importedReviews}
            currentUser={user}
            onReportReview={setReportingReviewId}
          />
        )}

        {/* Availability Tab */}
        {activeTab === 'booking' && (
          <BookingSection
            sitter={sitter}
            services={services}
            sitterAddons={sitterAddons}
            pets={pets}
            selectedPetIds={selectedPetIds}
            onPetSelectionChange={setSelectedPetIds}
            availability={availability}
            loyaltyInfo={loyaltyInfo}
            depositCredit={depositCredit}
            isOwnProfile={isOwnProfile}
            user={user}
            token={token}
            cityName={cityName}
            bookingRef={bookingRef}
            onAvailabilityLoaded={handleAvailabilityLoaded}
            initialServiceId={highlightServiceId ?? (serviceIdParam ? Number(serviceIdParam) : null)}
            editProps={editPropsValue}
          />
        )}
      </div>

      {/* Create Post Dialog */}
      <CreatePostDialog
        open={showCreatePost}
        onOpenChange={setShowCreatePost}
        onPostCreated={() => setPostsKey((k) => k + 1)}
      />

      {/* Report Review Dialog */}
      {reportingReviewId != null && (
        <ReportReviewDialog
          reviewId={reportingReviewId}
          open={reportingReviewId != null}
          onOpenChange={(open) => { if (!open) setReportingReviewId(null); }}
          token={token}
        />
      )}
    </div>
  );
}

