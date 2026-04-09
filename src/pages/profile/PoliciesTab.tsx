import { useState, useEffect, useCallback } from 'react';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { Save, Check, ShieldCheck, Heart, Plus, Trash2, Camera, Eye, Home, Mic, Shield, Share2 } from 'lucide-react';
import { API_BASE } from '../../config';
import type { CancellationPolicy } from '../../types';
import { CAMERA_LOCATIONS, CAMERA_LOCATION_LABELS, getCameraGuidelines, type CameraLocation } from '../../shared/camera-guidelines';

interface LoyaltyTier {
  min_bookings: number;
  discount_percent: number;
}

const CANCELLATION_POLICIES: { value: CancellationPolicy; label: string; description: string }[] = [
  { value: 'flexible', label: 'Flexible', description: 'Full refund if cancelled at least 24 hours before the booking.' },
  { value: 'moderate', label: 'Moderate', description: '50% refund if cancelled at least 48 hours before the booking.' },
  { value: 'strict', label: 'Strict', description: 'No refund within 7 days of the booking.' },
];

const GUIDELINE_ICONS: Record<string, React.ElementType> = { eye: Eye, home: Home, mic: Mic, shield: Shield, share: Share2 };

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={onChange}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors ${checked ? 'bg-emerald-600' : 'bg-stone-300'}`}>
      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform mt-0.5 ${checked ? 'translate-x-5 ml-0.5' : 'translate-x-0 ml-0.5'}`} />
    </button>
  );
}

export default function PoliciesTab() {
  const { user, token, updateUser } = useAuth();

  const [policy, setPolicy] = useState<CancellationPolicy>('flexible');
  const [houseRules, setHouseRules] = useState('');
  const [emergencyProcedures, setEmergencyProcedures] = useState('');
  const [hasInsurance, setHasInsurance] = useState(false);
  const [hasCameras, setHasCameras] = useState(false);
  const [cameraLocations, setCameraLocations] = useState<string[]>([]);
  const [cameraPolicyNote, setCameraPolicyNote] = useState('');
  const [loyaltyTiers, setLoyaltyTiers] = useState<LoyaltyTier[]>([]);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!user) return;
    setPolicy(user.cancellation_policy || 'flexible');
    setHouseRules(user.house_rules || '');
    setEmergencyProcedures(user.emergency_procedures || '');
    setHasInsurance(user.has_insurance || false);
    setHasCameras(user.has_cameras || false);
    setCameraLocations(user.camera_locations || []);
    setCameraPolicyNote(user.camera_policy_note || '');
  }, [user]);


  const fetchLoyaltyTiers = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/loyalty-discounts`, { headers: getAuthHeaders(token) });
      if (res.ok) {
        const data = await res.json();
        setLoyaltyTiers(
          data.tiers.map((t: { min_bookings: number; discount_percent: number }) => ({
            min_bookings: t.min_bookings,
            discount_percent: t.discount_percent,
          }))
        );
      }
    } catch {
      // Non-critical
    }
  }, [token]);

  useEffect(() => {
    if (!user?.roles?.includes('sitter')) return;
    fetchLoyaltyTiers();
  }, [user, fetchLoyaltyTiers]);

  const addLoyaltyTier = () => {
    if (loyaltyTiers.length >= 5) return;
    const nextMin = loyaltyTiers.length > 0
      ? Math.max(...loyaltyTiers.map((t) => t.min_bookings)) + 5
      : 3;
    const nextDiscount = loyaltyTiers.length > 0
      ? Math.min(50, Math.max(...loyaltyTiers.map((t) => t.discount_percent)) + 5)
      : 5;
    setLoyaltyTiers([...loyaltyTiers, { min_bookings: nextMin, discount_percent: nextDiscount }]);
  };

  const removeLoyaltyTier = (index: number) => {
    setLoyaltyTiers(loyaltyTiers.filter((_, i) => i !== index));
  };

  const updateLoyaltyTier = (index: number, field: keyof LoyaltyTier, value: number) => {
    setLoyaltyTiers(
      loyaltyTiers.map((tier, i) =>
        i === index ? { ...tier, [field]: value } : tier
      )
    );
  };

  const toggleCameraLocation = (loc: string) => {
    setCameraLocations((prev) =>
      prev.includes(loc) ? prev.filter((l) => l !== loc) : [...prev, loc],
    );
  };

  const handleSaveAll = async () => {
    setSaving(true);
    setMessage('');
    try {
      const policyRes = await fetch(`${API_BASE}/cancellation-policy`, {
        method: 'PUT',
        headers: getAuthHeaders(token),
        body: JSON.stringify({ cancellation_policy: policy }),
      });
      if (!policyRes.ok) throw new Error('Failed to save cancellation policy');

      const userRes = await fetch(`${API_BASE}/users/me`, {
        method: 'PUT',
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          name: user?.name,
          house_rules: houseRules || null,
          emergency_procedures: emergencyProcedures || null,
          has_insurance: hasInsurance,
          has_cameras: hasCameras,
          camera_locations: hasCameras ? cameraLocations : [],
          camera_policy_note: hasCameras ? cameraPolicyNote || null : null,
        }),
      });
      if (userRes.ok) {
        const data = await userRes.json();
        updateUser(data.user);
      }

      const loyaltyRes = await fetch(`${API_BASE}/loyalty-discounts`, {
        method: 'PUT',
        headers: getAuthHeaders(token),
        body: JSON.stringify({ tiers: loyaltyTiers }),
      });
      if (!loyaltyRes.ok) throw new Error('Failed to save discount tiers');

      setMessage('Policies saved');
      setTimeout(() => setMessage(''), 3000);
    } catch {
      setMessage('Failed to save policies');
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  const guidelines = getCameraGuidelines();

  return (
    <div className="space-y-6">
      {/* Cancellation Policy */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
          <h3 className="text-sm font-bold text-stone-900">Cancellation Policy</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {CANCELLATION_POLICIES.map((p) => (
            <button key={p.value} type="button" onClick={() => setPolicy(p.value)}
              className={`text-left p-4 rounded-xl border-2 transition-colors ${policy === p.value ? 'border-emerald-500 bg-emerald-50' : 'border-stone-200 hover:border-stone-300 bg-white'}`}>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-stone-900">{p.label}</span>
                {policy === p.value && (
                  <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}
              </div>
              <p className="text-sm text-stone-500 mt-1">{p.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* House Rules */}
      <div className="border-t pt-4">
        <label className="block text-sm font-medium text-stone-700 mb-1">House Rules</label>
        <textarea rows={3} value={houseRules} onChange={(e) => setHouseRules(e.target.value)}
          placeholder="E.g., pets must be up to date on vaccinations, no aggressive dogs..."
          className="w-full p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500 text-sm resize-none" />
      </div>

      {/* Emergency Procedures */}
      <div className="border-t pt-4">
        <label className="block text-sm font-medium text-stone-700 mb-1">Emergency Procedures</label>
        <textarea rows={3} value={emergencyProcedures} onChange={(e) => setEmergencyProcedures(e.target.value)}
          placeholder="What you do in an emergency situation..."
          className="w-full p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500 text-sm resize-none" />
      </div>

      {/* Insurance Toggle */}
      <div className="border-t pt-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-stone-700">I carry pet sitter insurance</span>
          <Toggle checked={hasInsurance} onChange={() => setHasInsurance((prev) => !prev)} />
        </div>
      </div>

      {/* Camera Disclosure */}
      <div className="border-t pt-4">
        <div className="flex items-center gap-2 mb-3">
          <Camera className="w-5 h-5 text-emerald-600" />
          <h3 className="text-sm font-bold text-stone-900">Camera Disclosure</h3>
        </div>

        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-medium text-stone-900">I have cameras in my home</p>
            <p className="text-xs text-stone-500">Let sitters know about cameras before bookings</p>
          </div>
          <Toggle checked={hasCameras} onChange={() => setHasCameras((prev) => !prev)} />
        </div>

        {hasCameras && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-2">Camera locations</label>
              <div className="flex flex-wrap gap-2">
                {CAMERA_LOCATIONS.map((loc) => (
                  <button key={loc} type="button" onClick={() => toggleCameraLocation(loc)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${cameraLocations.includes(loc) ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'}`}>
                    {CAMERA_LOCATION_LABELS[loc as CameraLocation]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">Additional notes</label>
              <textarea value={cameraPolicyNote} onChange={(e) => setCameraPolicyNote(e.target.value)}
                placeholder="e.g., Cameras are only active during bookings, audio is disabled..." maxLength={500} rows={3}
                className="w-full p-3 border border-stone-200 rounded-lg text-sm focus:ring-emerald-500 focus:border-emerald-500 resize-none" />
              <p className="text-xs text-stone-400 mt-1">{cameraPolicyNote.length}/500</p>
            </div>
          </div>
        )}

        {/* Guidelines */}
        <div className="bg-stone-50 rounded-xl p-4 mt-4 space-y-3">
          <h4 className="text-xs font-semibold text-stone-700 uppercase tracking-wide flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5" /> Camera Best Practices
          </h4>
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

      {/* Repeat Customer Discounts */}
      {user.roles?.includes('sitter') && (
        <div className="border-t pt-4">
          <div className="flex items-center gap-2 mb-3">
            <Heart className="w-5 h-5 text-emerald-600" />
            <h3 className="text-sm font-bold text-stone-900">Repeat Customer Discounts</h3>
          </div>
          <p className="text-sm text-stone-500 mb-3">
            Reward loyal clients with automatic discounts based on completed bookings.
          </p>

          <div className="space-y-3">
            {loyaltyTiers.map((tier, index) => (
              <div key={index} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-stone-200">
                <div className="flex-1">
                  <label className="block text-xs text-stone-500 mb-1">After bookings</label>
                  <input type="number" min={1} max={100} value={tier.min_bookings}
                    onChange={(e) => updateLoyaltyTier(index, 'min_bookings', parseInt(e.target.value, 10) || 1)}
                    className="w-full p-2 border border-stone-200 rounded-lg text-sm focus:ring-emerald-500 focus:border-emerald-500" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-stone-500 mb-1">Discount %</label>
                  <input type="number" min={1} max={50} value={tier.discount_percent}
                    onChange={(e) => updateLoyaltyTier(index, 'discount_percent', parseInt(e.target.value, 10) || 1)}
                    className="w-full p-2 border border-stone-200 rounded-lg text-sm focus:ring-emerald-500 focus:border-emerald-500" />
                </div>
                <button type="button" onClick={() => removeLoyaltyTier(index)}
                  className="mt-4 p-2 text-stone-400 hover:text-red-500 transition-colors" aria-label="Remove tier">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {loyaltyTiers.length < 5 && (
            <button
              type="button"
              onClick={addLoyaltyTier}
              className="mt-3 flex items-center gap-1.5 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
            >
              <Plus className="w-4 h-4" />
              Add discount tier
            </button>
          )}
        </div>
      )}

      {/* Message */}
      {message && (
        <div className={`text-sm text-center p-2 rounded-lg ${
          message.includes('saved') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
        }`}>
          {message}
        </div>
      )}

      {/* Save All */}
      <button type="button" onClick={handleSaveAll} disabled={saving}
        className="w-full bg-emerald-600 text-white py-3 rounded-lg font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
        <Save className="w-4 h-4" />
        {saving ? 'Saving...' : 'Save All Policies'}
      </button>
    </div>
  );
}
