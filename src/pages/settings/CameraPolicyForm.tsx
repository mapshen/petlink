import { useState, useEffect } from 'react';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { Save, Check, Camera, Eye, Home, Mic, Shield, Share2 } from 'lucide-react';
import { API_BASE } from '../../config';
import { CAMERA_LOCATIONS, CAMERA_LOCATION_LABELS, getCameraGuidelines, type CameraLocation } from '../../shared/camera-guidelines';

const GUIDELINE_ICONS: Record<string, React.ElementType> = {
  eye: Eye,
  home: Home,
  mic: Mic,
  shield: Shield,
  share: Share2,
};

export default function CameraPolicyForm({ token }: { token: string | null }) {
  const { user, updateUser } = useAuth();

  const [hasCameras, setHasCameras] = useState(false);
  const [cameraLocations, setCameraLocations] = useState<string[]>([]);
  const [cameraPolicyNote, setCameraPolicyNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    setHasCameras(user.has_cameras || false);
    setCameraLocations(user.camera_locations || []);
    setCameraPolicyNote(user.camera_policy_note || '');
  }, [user]);

  const toggleLocation = (loc: string) => {
    setCameraLocations((prev) =>
      prev.includes(loc) ? prev.filter((l) => l !== loc) : [...prev, loc],
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const res = await fetch(`${API_BASE}/users/me`, {
        method: 'PUT',
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          name: user?.name,
          has_cameras: hasCameras,
          camera_locations: hasCameras ? cameraLocations : [],
          camera_policy_note: hasCameras ? cameraPolicyNote || null : null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save');
      }
      const data = await res.json();
      updateUser(data.user);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const guidelines = getCameraGuidelines();

  return (
    <div className="space-y-6">
      {/* Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-stone-900">I have cameras in my home</p>
          <p className="text-xs text-stone-500">Let sitters know about cameras before bookings</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={hasCameras}
          onClick={() => setHasCameras((prev) => !prev)}
          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors ${
            hasCameras ? 'bg-emerald-600' : 'bg-stone-300'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform mt-0.5 ${
              hasCameras ? 'translate-x-5 ml-0.5' : 'translate-x-0 ml-0.5'
            }`}
          />
        </button>
      </div>

      {hasCameras && (
        <>
          {/* Camera Locations */}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">Camera locations</label>
            <div className="flex flex-wrap gap-2">
              {CAMERA_LOCATIONS.map((loc) => (
                <button
                  key={loc}
                  type="button"
                  onClick={() => toggleLocation(loc)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    cameraLocations.includes(loc)
                      ? 'bg-emerald-600 text-white'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}
                >
                  {CAMERA_LOCATION_LABELS[loc as CameraLocation]}
                </button>
              ))}
            </div>
          </div>

          {/* Policy Note */}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Additional notes</label>
            <textarea
              value={cameraPolicyNote}
              onChange={(e) => setCameraPolicyNote(e.target.value)}
              placeholder="e.g., Cameras are only active during bookings, audio is disabled..."
              maxLength={500}
              rows={3}
              className="w-full p-3 border border-stone-200 rounded-lg text-sm focus:ring-emerald-500 focus:border-emerald-500 resize-none"
            />
            <p className="text-xs text-stone-400 mt-1">{cameraPolicyNote.length}/500</p>
          </div>
        </>
      )}

      {/* Guidelines */}
      <div className="bg-stone-50 rounded-xl p-4">
        <h4 className="text-xs font-semibold text-stone-700 uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <Camera className="w-3.5 h-3.5" />
          Camera Best Practices
        </h4>
        <div className="space-y-3">
          {guidelines.map((g) => {
            const Icon = GUIDELINE_ICONS[g.icon] || Eye;
            return (
              <div key={g.title} className="flex gap-2.5">
                <Icon className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-stone-800">{g.title}</p>
                  <p className="text-xs text-stone-500">{g.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
      >
        {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
        {saving ? 'Saving...' : saved ? 'Saved' : 'Save Camera Policy'}
      </button>
    </div>
  );
}
