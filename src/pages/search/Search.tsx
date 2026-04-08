import React, { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { SitterWithService } from '../../types';
import { MapPin, Star, ShieldCheck, AlertCircle, RefreshCw, Navigation, Search as SearchIcon, Clock, Users, CalendarCheck, Shield } from 'lucide-react';
import { API_BASE } from '../../config';
import { useAuth } from '../../context/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { useFavorites } from '../../hooks/useFavorites';
import { useMapViewPreference } from '../../hooks/useMapViewPreference';
import { useTurnstile } from '../../hooks/useTurnstile';
import FavoriteButton from '../../components/profile/FavoriteButton';
import TurnstileWidget from '../../components/auth/TurnstileWidget';
import { FoundingSitterBadge } from '../../components/badges/FoundingSitterBadge';
import MapViewToggle from '../../components/map/MapViewToggle';
import { metersToMiles } from '../../lib/geo';
import { getServiceLabel } from '../../shared/service-labels';
import { getDisplayName } from '../../shared/display-name';
import { formatCents } from '../../lib/money';
import { getAddonBySlug } from '../../shared/addon-catalog';
import { formatResponseTime } from '../../shared/response-time';
import SearchFilters, { type SearchFiltersState } from '../../components/search/SearchFilters';
import LocationAutocomplete from '../../components/search/LocationAutocomplete';

const SitterClusterMap = lazy(() => import('../../components/map/SitterClusterMap'));

interface Coords {
  lat: number;
  lng: number;
}

const RADIUS_OPTIONS = [
  { label: '5 mi', value: 8047 },
  { label: '10 mi', value: 16093 },
  { label: '25 mi', value: 40234 },
  { label: '50 mi', value: 80467 },
];

const SERVICE_LABELS: Record<string, string> = {
  walking: 'Pet Walkers',
  sitting: 'House Sitters',
  grooming: 'Groomers',
  meet_greet: 'Meet & Greet',
  'drop-in': 'Drop-in Visits',
  daycare: 'Daycare Providers',
};

const SPECIES_EMOJI: Record<string, string> = { dog: '🐕', cat: '🐱', bird: '🐦', reptile: '🦎', small_animal: '🐹' };

const STORAGE_KEY = 'petlink_search_filters';

function loadSavedFilters(): Partial<SearchFiltersState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw);
    if (typeof p !== 'object' || p === null) return {};
    return {
      species: typeof p.species === 'string' ? p.species : '',
      petSize: typeof p.petSize === 'string' ? p.petSize : '',
      dateFrom: typeof p.dateFrom === 'string' ? p.dateFrom : '',
      dateTo: typeof p.dateTo === 'string' ? p.dateTo : '',
      minPrice: typeof p.minPrice === 'string' ? p.minPrice : '',
      maxPrice: typeof p.maxPrice === 'string' ? p.maxPrice : '',
      cancellationPolicy: typeof p.cancellationPolicy === 'string' ? p.cancellationPolicy : '',
      responseTime: typeof p.responseTime === 'string' ? p.responseTime : '',
      selectedBadges: Array.isArray(p.selectedBadges) ? p.selectedBadges.filter((b: unknown) => typeof b === 'string') : [],
    };
  } catch {
    return {};
  }
}

function saveFilters(filters: SearchFiltersState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch { /* quota exceeded, ignore */ }
}

const EMPTY_FILTERS: SearchFiltersState = {
  species: '',
  petSize: '',
  dateFrom: '',
  dateTo: '',
  minPrice: '',
  maxPrice: '',
  cancellationPolicy: '',
  responseTime: '',
  selectedBadges: [],
};

async function geocodeAddress(address: string): Promise<Coords | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`,
      { headers: { 'User-Agent': 'PetLink/1.0' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data.length === 0) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 1024px)').matches : false
  );
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)');
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  return isDesktop;
}

export default function Search() {
  useDocumentTitle('Search');
  const [searchParams, setSearchParams] = useSearchParams();
  const serviceType = searchParams.get('serviceType') || 'walking';
  const initialLocation = searchParams.get('location') || '';

  const [sitters, setSitters] = useState<SitterWithService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const [locationInput, setLocationInput] = useState(initialLocation);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [radius, setRadius] = useState(RADIUS_OPTIONS[1].value);
  const [geocoding, setGeocoding] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Unified filter state: URL params take priority, then localStorage, then defaults
  const [filters, setFilters] = useState<SearchFiltersState>(() => {
    const saved = loadSavedFilters();
    return {
      species: searchParams.get('species') || saved.species || '',
      petSize: searchParams.get('petSize') || saved.petSize || '',
      dateFrom: searchParams.get('dateFrom') || saved.dateFrom || '',
      dateTo: searchParams.get('dateTo') || saved.dateTo || '',
      minPrice: searchParams.get('minPrice') || saved.minPrice || '',
      maxPrice: searchParams.get('maxPrice') || saved.maxPrice || '',
      cancellationPolicy: searchParams.get('cancellationPolicy') || saved.cancellationPolicy || '',
      responseTime: searchParams.get('responseTime') || saved.responseTime || '',
      selectedBadges: searchParams.get('badges')?.split(',').filter(Boolean) || saved.selectedBadges || [],
    };
  });
  const [debouncedMinPrice, setDebouncedMinPrice] = useState(filters.minPrice);
  const [debouncedMaxPrice, setDebouncedMaxPrice] = useState(filters.maxPrice);

  const [highlightedSitterId, setHighlightedSitterId] = useState<number | null>(null);

  const { token: turnstileToken, containerRef: turnstileRef } = useTurnstile({
    siteKey: import.meta.env.VITE_TURNSTILE_SITE_KEY,
  });

  // Debounce price inputs to avoid excessive API calls
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedMinPrice(filters.minPrice), 300);
    return () => clearTimeout(timer);
  }, [filters.minPrice]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedMaxPrice(filters.maxPrice), 300);
    return () => clearTimeout(timer);
  }, [filters.maxPrice]);

  // Persist filters to localStorage
  useEffect(() => { saveFilters(filters); }, [filters]);

  const handleFilterChange = useCallback(<K extends keyof SearchFiltersState>(key: K, value: SearchFiltersState[K]) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
  }, []);
  const { view, setView } = useMapViewPreference();
  const isDesktop = useIsDesktop();

  const showList = view === 'list' || view === 'split';
  const showMap = view === 'map' || view === 'split';

  useEffect(() => {
    if (initialLocation && !coords) {
      handleGeocode(initialLocation);
    }
  }, []);

  const handleGeocode = useCallback(async (address: string) => {
    if (!address.trim()) return;
    setGeocoding(true);
    setGeoError(null);
    const result = await geocodeAddress(address);
    setGeocoding(false);
    if (result) {
      setCoords(result);
    } else {
      setGeoError('Could not find that location. Try a different address or zip code.');
    }
  }, []);

  const handleUseMyLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser.');
      return;
    }
    setGeocoding(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoords({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocationInput('My Location');
        setGeocoding(false);
      },
      () => {
        setGeoError('Unable to get your location. Please enter an address instead.');
        setGeocoding(false);
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }, []);

  const handleLocationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleGeocode(locationInput);
  };

  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (debouncedMinPrice) params.set('minPrice', debouncedMinPrice); else params.delete('minPrice');
    if (debouncedMaxPrice) params.set('maxPrice', debouncedMaxPrice); else params.delete('maxPrice');
    if (filters.petSize) params.set('petSize', filters.petSize); else params.delete('petSize');
    if (filters.species) params.set('species', filters.species); else params.delete('species');
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom); else params.delete('dateFrom');
    if (filters.dateTo) params.set('dateTo', filters.dateTo); else params.delete('dateTo');
    if (filters.cancellationPolicy) params.set('cancellationPolicy', filters.cancellationPolicy); else params.delete('cancellationPolicy');
    if (filters.responseTime) params.set('responseTime', filters.responseTime); else params.delete('responseTime');
    if (filters.selectedBadges.length > 0) params.set('badges', filters.selectedBadges.join(',')); else params.delete('badges');
    setSearchParams(params, { replace: true });
  }, [debouncedMinPrice, debouncedMaxPrice, filters]);

  useEffect(() => {
    const fetchSitters = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ serviceType });
        if (coords) {
          params.set('lat', coords.lat.toString());
          params.set('lng', coords.lng.toString());
          params.set('radius', radius.toString());
        }
        if (debouncedMinPrice) params.set('minPrice', debouncedMinPrice);
        if (debouncedMaxPrice) params.set('maxPrice', debouncedMaxPrice);
        if (filters.petSize) params.set('petSize', filters.petSize);
        if (filters.species) params.set('species', filters.species);
        if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
        if (filters.dateTo) params.set('dateTo', filters.dateTo);
        if (filters.cancellationPolicy) params.set('cancellationPolicy', filters.cancellationPolicy);
        if (filters.responseTime) params.set('responseTime', filters.responseTime);
        if (filters.selectedBadges.length > 0) params.set('badges', filters.selectedBadges.join(','));
        const headers: Record<string, string> = {};
        if (turnstileToken) {
          headers['cf-turnstile-response'] = turnstileToken;
        }
        const res = await fetch(`${API_BASE}/sitters?${params}`, { headers });
        if (!res.ok) throw new Error('Failed to load sitters');
        const data = await res.json();
        setSitters(data.sitters);
      } catch {
        setError('Failed to load sitters. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    fetchSitters();
  }, [serviceType, coords, radius, retryCount, debouncedMinPrice, debouncedMaxPrice, filters, turnstileToken]);

  const { user: authUser } = useAuth();
  const { isFavorited, toggleFavorite } = useFavorites();

  const serviceLabel = SERVICE_LABELS[serviceType] || 'Sitters';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <TurnstileWidget containerRef={turnstileRef} />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-stone-900">{serviceLabel}</h1>
        <MapViewToggle view={view} onViewChange={setView} showSplitOption={isDesktop} />
      </div>

      {/* Location Search Bar */}
      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-4 mb-4">
        <form onSubmit={handleLocationSubmit} className="flex flex-col sm:flex-row gap-3">
          <LocationAutocomplete
            value={locationInput}
            onChange={setLocationInput}
            onSelect={(lat, lng) => {
              setCoords({ lat, lng });
            }}
          />

          <select
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            className="px-3 py-2.5 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          >
            {RADIUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <button
            type="submit"
            disabled={geocoding || !locationInput.trim()}
            className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <SearchIcon className="w-4 h-4" />
            {geocoding ? 'Searching...' : 'Search'}
          </button>

          <button
            type="button"
            onClick={handleUseMyLocation}
            disabled={geocoding}
            className="px-4 py-2.5 border border-stone-200 text-stone-700 rounded-xl text-sm font-medium hover:bg-stone-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Navigation className="w-4 h-4" />
            <span className="hidden sm:inline">Use My Location</span>
            <span className="sm:hidden">My Location</span>
          </button>
        </form>

        {geoError && (
          <p className="mt-2 text-xs text-amber-600 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> {geoError}
          </p>
        )}

        {coords && !geoError && (
          <p className="mt-2 text-xs text-stone-400">
            Searching within {RADIUS_OPTIONS.find(o => o.value === radius)?.label} of {locationInput || 'your location'}
          </p>
        )}
      </div>

      {/* Filters — horizontal pill bar */}
      <SearchFilters filters={filters} onFilterChange={handleFilterChange} onClearAll={clearFilters} />

      {error && (
        <div role="alert" className="mb-6 flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-grow">{error}</span>
          <button onClick={() => setRetryCount(c => c + 1)} disabled={loading} className="flex items-center gap-1 text-red-600 hover:text-red-800 font-medium disabled:opacity-50">
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12" role="status" aria-live="polite">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
          <span className="sr-only">Loading...</span>
        </div>
      ) : (
        <div className={view === 'split' ? 'grid lg:grid-cols-2 gap-6' : ''}>
          {/* Sitter List */}
          {showList && (
            <div className={view === 'split' ? 'overflow-y-auto max-h-[calc(100vh-200px)] pr-2 space-y-4' : ''}>
              <div className={view === 'list' ? 'grid md:grid-cols-2 lg:grid-cols-3 gap-6' : 'space-y-4'}>
                {sitters.map((sitter) => (
                  <Link
                    key={sitter.id}
                    to={`/sitter/${sitter.slug || sitter.id}`}
                    className="block group"
                    onMouseEnter={() => setHighlightedSitterId(sitter.id)}
                    onMouseLeave={() => setHighlightedSitterId(null)}
                  >
                    <div className={`bg-white rounded-2xl shadow-sm border overflow-hidden hover:shadow-md transition-all duration-300 relative ${
                      highlightedSitterId === sitter.id ? 'border-emerald-400 ring-1 ring-emerald-400' : 'border-stone-100'
                    }`}>
                      {authUser && (
                        <div className="absolute top-3 right-3 z-10">
                          <FavoriteButton
                            sitterId={sitter.id}
                            isFavorited={isFavorited(sitter.id)}
                            onToggle={toggleFavorite}
                            size="sm"
                          />
                        </div>
                      )}
                      <div className="flex p-6 gap-4">
                        <div className="flex-shrink-0">
                          <img
                            src={sitter.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(sitter.name)}`}
                            alt={sitter.name}
                            className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-sm"
                          />
                        </div>
                        <div className="flex-grow min-w-0">
                          <div className="flex justify-between items-start">
                            <div>
                              <h3 className="text-lg font-bold text-stone-900 group-hover:text-emerald-600 transition-colors">
                                {getDisplayName(sitter.name)}
                              </h3>
                              <div className="flex items-center text-stone-500 text-sm mt-1">
                                <MapPin className="w-3 h-3 mr-1" />
                                {sitter.distance_meters != null
                                  ? <span>{metersToMiles(sitter.distance_meters)} away</span>
                                  : <span>Nearby</span>
                                }
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="block text-lg font-bold text-emerald-600">{sitter.price_cents === 0 ? 'Free' : formatCents(sitter.price_cents)}</span>
                              {sitter.price_cents > 0 && (
                                <span className="text-xs text-stone-400">
                                  {getServiceLabel(serviceType || sitter.service_type, filters.species ? [filters.species] : undefined)}
                                </span>
                              )}
                            </div>
                          </div>

                          <p className="text-stone-600 text-sm mt-3 line-clamp-2">{sitter.bio}</p>

                          {/* Row 1: Rating + core identity */}
                          <div className="mt-3 flex items-center gap-3 text-xs font-medium text-stone-500">
                            {sitter.avg_rating ? (
                              <div className="flex items-center gap-1 text-amber-500">
                                <Star className="w-3 h-3 fill-current" />
                                <span>{sitter.avg_rating} ({sitter.review_count})</span>
                              </div>
                            ) : (
                              <span className="text-stone-400">No reviews</span>
                            )}
                            <div className="flex items-center gap-1 text-emerald-600">
                              <ShieldCheck className="w-3 h-3" />
                              <span>Verified</span>
                            </div>
                            {sitter.years_experience != null && sitter.years_experience > 0 && (
                              <span className="text-stone-400">{sitter.years_experience}yr exp</span>
                            )}
                            {sitter.is_new && (
                              <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-xs font-medium">
                                New
                              </span>
                            )}
                            {sitter.founding_sitter && <FoundingSitterBadge />}
                          </div>

                          {/* Row 2: Trust signals */}
                          <div className="mt-2 flex items-center gap-3 text-xs text-stone-500">
                            {(() => {
                              const rt = formatResponseTime(sitter.avg_response_hours);
                              return rt ? (
                                <span className={`flex items-center gap-1 ${rt.color === 'emerald' ? 'text-emerald-600' : 'text-amber-600'}`}>
                                  <Clock className="w-3 h-3" />
                                  {rt.shortLabel}
                                </span>
                              ) : null;
                            })()}
                            {sitter.repeat_client_count != null && sitter.repeat_client_count > 0 && (
                              <span className="flex items-center gap-1">
                                <Users className="w-3 h-3" />
                                {sitter.repeat_client_count} repeat
                              </span>
                            )}
                            {sitter.cancellation_policy && (
                              <span className="flex items-center gap-1 capitalize">
                                <Shield className="w-3 h-3" />
                                {sitter.cancellation_policy}
                              </span>
                            )}
                            {sitter.has_availability && (
                              <span className="flex items-center gap-1 text-emerald-600">
                                <CalendarCheck className="w-3 h-3" />
                                Available
                              </span>
                            )}
                          </div>

                          {/* Row 3: Species + add-ons (compact) */}
                          <div className="mt-2 flex items-center gap-2 flex-wrap">
                            {sitter.accepted_species && sitter.accepted_species.length > 0 && (
                              <div className="flex gap-1">
                                {sitter.accepted_species.map((s: string) => (
                                  <span key={s} className="text-stone-400 text-xs" title={s.replace(/_/g, ' ')}>
                                    {SPECIES_EMOJI[s] || '🐾'}
                                  </span>
                                ))}
                              </div>
                            )}
                            {sitter.addon_slugs && sitter.addon_slugs.length > 0 && (
                              <>
                                {sitter.addon_slugs.slice(0, 3).map((slug: string) => {
                                  const def = getAddonBySlug(slug);
                                  return (
                                    <span key={slug} className="bg-emerald-50 text-emerald-700 text-[10px] font-medium px-2 py-0.5 rounded-full">
                                      {def?.emoji} {def?.shortLabel ?? slug}
                                    </span>
                                  );
                                })}
                                {sitter.addon_slugs.length > 3 && (
                                  <span className="bg-stone-100 text-stone-500 text-[10px] font-medium px-2 py-0.5 rounded-full">
                                    +{sitter.addon_slugs.length - 3} more
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}

                {sitters.length === 0 && (
                  <div className="col-span-full text-center py-12 bg-stone-50 rounded-2xl">
                    <p className="text-stone-500">
                      {filters.species || filters.petSize || filters.dateFrom || filters.dateTo || filters.minPrice || filters.maxPrice || filters.cancellationPolicy || filters.responseTime || filters.selectedBadges.length > 0
                        ? 'No sitters match your filters. Try adjusting or clearing filters.'
                        : coords
                          ? 'No sitters found in this area. Try expanding your search radius.'
                          : 'No sitters found. Try searching a specific location.'}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Map */}
          {showMap && (
            <div className={`${view === 'split' ? 'sticky top-24 h-[calc(100vh-200px)]' : 'h-[600px]'} rounded-2xl overflow-hidden`}>
              <Suspense fallback={
                <div className="w-full h-full bg-stone-100 rounded-2xl flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
                </div>
              }>
                <SitterClusterMap
                  sitters={sitters}
                  serviceType={serviceType}
                  searchCenter={coords}
                  searchRadius={radius}
                  highlightedSitterId={highlightedSitterId}
                />
              </Suspense>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
