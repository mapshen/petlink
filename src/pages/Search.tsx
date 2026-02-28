import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { User } from '../types';
import { MapPin, Star, ShieldCheck, AlertCircle, RefreshCw, Navigation, Search as SearchIcon } from 'lucide-react';
import { API_BASE } from '../config';

interface SitterWithService extends User {
  price: number;
  service_type: string;
  distance_meters?: number;
}

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

export default function Search() {
  const [searchParams, setSearchParams] = useSearchParams();
  const serviceType = searchParams.get('serviceType') || 'walking';
  const initialLocation = searchParams.get('location') || '';

  const [sitters, setSitters] = useState<SitterWithService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const [locationInput, setLocationInput] = useState(initialLocation);
  const [coords, setCoords] = useState<Coords | null>(null);
  const [radius, setRadius] = useState(RADIUS_OPTIONS[1].value); // Default 10 miles
  const [geocoding, setGeocoding] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  // Geocode on mount if location param provided
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

  // Fetch sitters when coords, serviceType, or radius changes
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
        const res = await fetch(`${API_BASE}/sitters?${params}`);
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
  }, [serviceType, coords, radius, retryCount]);

  const formatDistance = (meters?: number) => {
    if (!meters) return null;
    const miles = meters / 1609.34;
    return miles < 1 ? `${(miles * 5280).toFixed(0)} ft` : `${miles.toFixed(1)} mi`;
  };

  const serviceLabel = serviceType === 'walking' ? 'Dog Walkers'
    : serviceType === 'sitting' ? 'House Sitters'
    : serviceType === 'grooming' ? 'Groomers' : 'Drop-in Visits';

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-stone-900 mb-6">{serviceLabel}</h1>

      {/* Location Search Bar */}
      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-4 mb-8">
        <form onSubmit={handleLocationSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-grow">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input
              type="text"
              placeholder="Enter address, city, or zip code"
              value={locationInput}
              onChange={(e) => setLocationInput(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
            />
          </div>

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
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sitters.map((sitter) => (
            <Link key={sitter.id} to={`/sitter/${sitter.id}`} className="block group">
              <div className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden hover:shadow-md transition-all duration-300">
                <div className="flex p-6 gap-4">
                  <div className="flex-shrink-0">
                    <img
                      src={sitter.avatar_url || `https://ui-avatars.com/api/?name=${sitter.name}`}
                      alt={sitter.name}
                      className="w-16 h-16 rounded-full object-cover border-2 border-white shadow-sm"
                    />
                  </div>
                  <div className="flex-grow">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-lg font-bold text-stone-900 group-hover:text-emerald-600 transition-colors">
                          {sitter.name}
                        </h3>
                        <div className="flex items-center text-stone-500 text-sm mt-1">
                          <MapPin className="w-3 h-3 mr-1" />
                          {sitter.distance_meters != null
                            ? <span>{formatDistance(sitter.distance_meters)} away</span>
                            : <span>San Francisco, CA</span>
                          }
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="block text-lg font-bold text-emerald-600">${sitter.price}</span>
                        <span className="text-xs text-stone-400">per {serviceType === 'walking' ? 'walk' : 'night'}</span>
                      </div>
                    </div>

                    <p className="text-stone-600 text-sm mt-3 line-clamp-2">{sitter.bio}</p>

                    <div className="mt-4 flex items-center gap-4 text-xs font-medium text-stone-500">
                      <div className="flex items-center gap-1 text-amber-500">
                        <Star className="w-3 h-3 fill-current" />
                        <span>5.0 (12)</span>
                      </div>
                      <div className="flex items-center gap-1 text-emerald-600">
                        <ShieldCheck className="w-3 h-3" />
                        <span>Verified</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}

          {sitters.length === 0 && (
            <div className="col-span-full text-center py-12 bg-stone-50 rounded-2xl">
              <p className="text-stone-500">
                {coords
                  ? 'No sitters found in this area. Try expanding your search radius.'
                  : 'No sitters found. Try searching a specific location.'}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
