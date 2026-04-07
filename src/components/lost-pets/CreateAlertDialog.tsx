import React, { useState } from 'react';
import { AlertTriangle, X, Loader2, MapPin } from 'lucide-react';
import type { Pet } from '../../types';

interface CreateAlertDialogProps {
  pets: Pet[];
  onClose: () => void;
  onSubmit: (body: Record<string, unknown>) => Promise<unknown>;
}

export default function CreateAlertDialog({ pets, onClose, onSubmit }: CreateAlertDialogProps) {
  const [petId, setPetId] = useState<number | ''>('');
  const [description, setDescription] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [lastSeenAt, setLastSeenAt] = useState(
    new Date().toISOString().slice(0, 16)
  );
  const [radiusMiles, setRadiusMiles] = useState(10);
  const [contactPhone, setContactPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [geoLoading, setGeoLoading] = useState(false);

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser');
      return;
    }
    setGeoLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setGeoLoading(false);
      },
      () => {
        setError('Unable to get your location. Please enter coordinates manually.');
        setGeoLoading(false);
      }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!petId) {
      setError('Please select a pet');
      return;
    }
    if (!lat || !lng) {
      setError('Please provide the last seen location');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        pet_id: Number(petId),
        description,
        last_seen_lat: parseFloat(lat),
        last_seen_lng: parseFloat(lng),
        last_seen_at: new Date(lastSeenAt).toISOString(),
        search_radius_miles: radiusMiles,
        contact_phone: contactPhone || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create alert');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-stone-100">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <h2 className="font-bold text-stone-800">Report Lost Pet</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-stone-100">
            <X className="w-5 h-5 text-stone-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 text-sm rounded-xl">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Pet</label>
            <select
              value={petId}
              onChange={(e) => setPetId(e.target.value ? Number(e.target.value) : '')}
              className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              required
            >
              <option value="">Select a pet...</option>
              {pets.map((pet) => (
                <option key={pet.id} value={pet.id}>
                  {pet.name} ({pet.species})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your pet, what they were wearing, direction they went, etc."
              rows={3}
              className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 resize-none"
              required
              minLength={10}
              maxLength={2000}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Last Seen Location</label>
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              disabled={geoLoading}
              className="flex items-center gap-2 px-3 py-2 text-sm text-amber-700 bg-amber-50 rounded-xl hover:bg-amber-100 transition-colors mb-2"
            >
              {geoLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <MapPin className="w-4 h-4" />
              )}
              Use current location
            </button>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                step="any"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="Latitude"
                className="px-3 py-2 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500"
                required
              />
              <input
                type="number"
                step="any"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="Longitude"
                className="px-3 py-2 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Last Seen At</label>
            <input
              type="datetime-local"
              value={lastSeenAt}
              onChange={(e) => setLastSeenAt(e.target.value)}
              className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Search Radius ({radiusMiles} miles)
            </label>
            <input
              type="range"
              min={1}
              max={50}
              value={radiusMiles}
              onChange={(e) => setRadiusMiles(Number(e.target.value))}
              className="w-full accent-amber-500"
            />
            <div className="flex justify-between text-xs text-stone-400">
              <span>1 mi</span>
              <span>50 mi</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">
              Contact Phone <span className="text-stone-400">(optional)</span>
            </label>
            <input
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="555-0123"
              className="w-full px-3 py-2 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500"
              maxLength={20}
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white rounded-xl font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending Alert...
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4" />
                Send Alert to Nearby Sitters
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
