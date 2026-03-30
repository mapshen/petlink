import { useState, useEffect } from 'react';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { Save, MapPin } from 'lucide-react';
import { API_BASE } from '../../config';

export default function LocationTab() {
  const { user, token, updateUser } = useAuth();

  const [serviceRadius, setServiceRadius] = useState('10');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!user) return;
    setServiceRadius(user.service_radius_miles?.toString() || '10');
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch(`${API_BASE}/users/me`, {
        method: 'PUT',
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          name: user?.name,
          bio: user?.bio || null,
          avatar_url: user?.avatar_url || null,
          service_radius_miles: serviceRadius ? Number(serviceRadius) : null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Update failed');
      }
      const data = await res.json();
      updateUser(data.user);
      setMessage('Location settings updated successfully');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  const hasLocation = user.lat !== undefined && user.lng !== undefined && user.lat !== null && user.lng !== null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <h2 className="text-lg font-bold text-stone-900">Location</h2>

      {/* Service Area Display */}
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-2">Service Area</label>
        {hasLocation ? (
          <div className="bg-stone-50 rounded-xl border border-stone-200 p-4">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="w-4 h-4 text-emerald-600" />
              <span className="text-sm text-stone-700">
                {user.lat?.toFixed(4)}, {user.lng?.toFixed(4)}
              </span>
            </div>
            <div className="bg-stone-200 rounded-lg h-40 flex items-center justify-center text-stone-500 text-sm">
              Map preview ({serviceRadius} mi radius)
            </div>
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
            <p className="font-medium mb-1">No location set</p>
            <p className="text-amber-600">
              Your location is set automatically when you search. Visit the search page and use "My Location" to set it.
            </p>
          </div>
        )}
      </div>

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
          message.includes('success') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
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
        {saving ? 'Saving...' : 'Save Location Settings'}
      </button>
    </form>
  );
}
