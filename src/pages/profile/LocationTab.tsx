import { useState, useEffect, lazy, Suspense } from 'react';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { Save, MapPin, Navigation, Loader2 } from 'lucide-react';
import { API_BASE } from '../../config';
import LocationAutocomplete from '../../components/search/LocationAutocomplete';

const LocationMap = lazy(() => import('./LocationMap'));

export default function LocationTab() {
  const { user, token, updateUser } = useAuth();

  const [serviceRadius, setServiceRadius] = useState('10');
  const [address, setAddress] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [geolocating, setGeolocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [pendingLat, setPendingLat] = useState<number | null>(null);
  const [pendingLng, setPendingLng] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    setServiceRadius(user.service_radius_miles?.toString() || '10');
    if (user.lat && user.lng) {
      setPendingLat(user.lat);
      setPendingLng(user.lng);
      reverseGeocode(user.lat, user.lng);
    }
  }, [user]);

  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=12`,
        { headers: { 'Accept-Language': 'en' } },
      );
      if (res.ok) {
        const data = await res.json();
        const parts = [
          data.address?.city || data.address?.town || data.address?.village,
          data.address?.state,
        ].filter(Boolean);
        setAddress(parts.join(', ') || data.display_name?.split(',').slice(0, 2).join(',') || 'Location set');
      }
    } catch {
      setAddress('Location set');
    }
  };

  const handleGeolocate = () => {
    if (!navigator.geolocation) {
      setMessage('Geolocation is not supported by your browser.');
      return;
    }
    setGeolocating(true);
    setMessage('');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setPendingLat(lat);
        setPendingLng(lng);
        await reverseGeocode(lat, lng);
        setGeolocating(false);
      },
      () => {
        setMessage('Unable to get your location. Please check browser permissions.');
        setGeolocating(false);
      },
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const body: Record<string, unknown> = {
        name: user?.name,
        bio: user?.bio || null,
        avatar_url: user?.avatar_url || null,
        service_radius_miles: serviceRadius ? Number(serviceRadius) : null,
      };
      if (pendingLat !== null && pendingLng !== null) {
        body.lat = pendingLat;
        body.lng = pendingLng;
      }
      const res = await fetch(`${API_BASE}/users/me`, {
        method: 'PUT',
        headers: getAuthHeaders(token),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Update failed');
      }
      const data = await res.json();
      updateUser(data.user);
      setMessage('Location settings saved');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  const hasLocation = pendingLat !== null && pendingLng !== null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Address search */}
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-2">Set your location</label>
        <div className="flex gap-2">
          <LocationAutocomplete
            value={searchQuery}
            onChange={setSearchQuery}
            onSelect={(lat, lng, label) => {
              setPendingLat(lat);
              setPendingLng(lng);
              setAddress(label);
              setSearchQuery('');
            }}
            placeholder="Enter city, address, or zip code..."
          />
          <button
            type="button"
            onClick={handleGeolocate}
            disabled={geolocating}
            className="bg-stone-100 text-stone-700 px-4 rounded-lg text-sm font-medium hover:bg-stone-200 transition-colors disabled:opacity-50 flex items-center gap-1.5"
            title="Use my current location"
          >
            {geolocating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
            <span className="hidden sm:inline">My Location</span>
          </button>
        </div>
      </div>

      {/* Current location display with map */}
      {hasLocation && (
        <div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-semibold text-emerald-800">{address || 'Location set'}</span>
            </div>
          </div>
          <Suspense fallback={<div className="h-48 bg-stone-100 rounded-xl flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-stone-400" /></div>}>
            <LocationMap lat={pendingLat} lng={pendingLng} radiusMiles={Number(serviceRadius) || 10} />
          </Suspense>
        </div>
      )}

      {!hasLocation && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <p className="font-medium mb-1">No location set</p>
          <p className="text-amber-600">Search for your address or use "My Location" to set your service area.</p>
        </div>
      )}

      {/* Service Radius */}
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Service Radius</label>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={1}
            max={100}
            value={serviceRadius}
            onChange={(e) => setServiceRadius(e.target.value)}
            className="w-24 p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
          />
          <span className="text-sm text-stone-500">miles</span>
        </div>
        <p className="text-xs text-stone-400 mt-1">Pet owners within this radius will see your profile in search results.</p>
      </div>

      {message && (
        <div className={`text-sm text-center p-2 rounded-lg ${
          message.includes('saved') || message.includes('success') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
        }`}>
          {message}
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="w-full bg-emerald-600 text-white py-3 rounded-lg font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <Save className="w-4 h-4" />
        {saving ? 'Saving...' : 'Save Location'}
      </button>
    </form>
  );
}
