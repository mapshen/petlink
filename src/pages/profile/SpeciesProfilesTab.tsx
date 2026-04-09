import { useState, useEffect, useCallback } from 'react';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { Save, Camera, Eye, Home, Mic, Shield, Share2 } from 'lucide-react';
import { API_BASE } from '../../config';
import type { SitterSpeciesProfile, Service, SitterAddon } from '../../types';
import SpeciesCard from '../../components/profile/SpeciesCard';
import { SPECIES_ICONS, formatSpecies } from '../../shared/species-utils';
import type { AddonDefinition } from '../../shared/addon-catalog';
import { CAMERA_LOCATIONS, CAMERA_LOCATION_LABELS, getCameraGuidelines, type CameraLocation } from '../../shared/camera-guidelines';

const GUIDELINE_ICONS: Record<string, React.ElementType> = { eye: Eye, home: Home, mic: Mic, shield: Shield, share: Share2 };

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={onChange}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full transition-colors ${checked ? 'bg-emerald-600' : 'bg-stone-300'}`}>
      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform mt-0.5 ${checked ? 'translate-x-5 ml-0.5' : 'translate-x-0 ml-0.5'}`} />
    </button>
  );
}

const ALL_SPECIES = ['dog', 'cat', 'bird', 'reptile', 'small_animal'] as const;

export default function SpeciesProfilesTab() {
  const { user, token, updateUser } = useAuth();
  const [profiles, setProfiles] = useState<Record<string, Partial<SitterSpeciesProfile>>>({});
  const [services, setServices] = useState<Service[]>([]);
  const [activeSpecies, setActiveSpecies] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | ''>('');
  const [loading, setLoading] = useState(true);
  const [newlyAdded, setNewlyAdded] = useState<Set<string>>(new Set());
  const [addons, setAddons] = useState<SitterAddon[]>([]);
  const [addonSaving, setAddonSaving] = useState(false);
  const [hasInsurance, setHasInsurance] = useState(false);
  const [hasCameras, setHasCameras] = useState(false);
  const [cameraLocations, setCameraLocations] = useState<string[]>([]);
  const [cameraPolicyNote, setCameraPolicyNote] = useState('');

  const toggleCameraLocation = (loc: string) => {
    setCameraLocations((prev) =>
      prev.includes(loc) ? prev.filter((l) => l !== loc) : [...prev, loc],
    );
  };

  // Init insurance/camera from user
  useEffect(() => {
    if (!user) return;
    setHasInsurance(user.has_insurance || false);
    setHasCameras(user.has_cameras || false);
    setCameraLocations(user.camera_locations || []);
    setCameraPolicyNote(user.camera_policy_note || '');
  }, [user]);

  const fetchAddons = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/addons/me`, { headers: getAuthHeaders(token) });
      if (res.ok) {
        const data = await res.json();
        setAddons(data.addons || []);
      }
    } catch {
      // Non-critical
    }
  }, [token]);

  // Fetch existing profiles, services, and addons
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();

    Promise.all([
      fetch(`${API_BASE}/species-profiles/me`, { headers: getAuthHeaders(token), signal: controller.signal }),
      fetch(`${API_BASE}/services/me`, { headers: getAuthHeaders(token), signal: controller.signal }),
      fetch(`${API_BASE}/addons/me`, { headers: getAuthHeaders(token), signal: controller.signal }),
    ])
      .then(async ([profilesRes, servicesRes, addonsRes]) => {
        if (profilesRes.ok) {
          const data = await profilesRes.json();
          const profileMap: Record<string, Partial<SitterSpeciesProfile>> = {};
          const speciesList: string[] = [];
          for (const p of data.profiles) {
            profileMap[p.species] = p;
            speciesList.push(p.species);
          }
          setProfiles(profileMap);
          setActiveSpecies(speciesList);
        }
        if (servicesRes.ok) {
          const data = await servicesRes.json();
          setServices(data.services || []);
        }
        if (addonsRes.ok) {
          const data = await addonsRes.json();
          setAddons(data.addons || []);
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') {
          setMessage('Failed to load profile data');
          setMessageType('error');
        }
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [token]);

  const addSpecies = (species: string) => {
    if (activeSpecies.includes(species)) return;
    setActiveSpecies((prev) => [...prev, species]);
    setNewlyAdded((prev) => new Set([...prev, species]));
    setProfiles((prev) => ({
      ...prev,
      [species]: { species, years_experience: undefined, accepted_pet_sizes: [], skills: [], max_pets: 1, owns_same_species: false },
    }));
  };

  const removeSpecies = (species: string) => {
    if (!confirm(`Remove ${formatSpecies(species)} from your profile? This will delete all ${formatSpecies(species).toLowerCase()} services and settings.`)) return;
    setActiveSpecies((prev) => prev.filter((s) => s !== species));
    setProfiles((prev) => {
      const updated = { ...prev };
      delete updated[species];
      return updated;
    });
    setServices((prev) => prev.filter((s) => s.species !== species));
  };

  const updateProfile = (species: string, profile: Partial<SitterSpeciesProfile>) => {
    setProfiles((prev) => ({ ...prev, [species]: profile }));
  };

  const updateServicePrice = (species: string, serviceType: string, price_cents: number) => {
    setServices((prev) => {
      const existing = prev.find((s) => s.type === serviceType && s.species === species);
      if (existing) {
        return prev.map((s) => s.type === serviceType && s.species === species ? { ...s, price_cents } : s);
      }
      return [...prev, { id: 0, sitter_id: user?.id || 0, type: serviceType as Service['type'], price_cents, species } as Service];
    });
  };

  const handleAddonToggle = async (species: string, def: AddonDefinition) => {
    const existing = addons.find((a) => a.addon_slug === def.slug && a.species === species);
    setAddonSaving(true);
    try {
      if (existing) {
        const res = await fetch(`${API_BASE}/addons/${existing.id}`, {
          method: 'DELETE',
          headers: getAuthHeaders(token),
        });
        if (!res.ok) throw new Error('Failed to remove add-on');
      } else {
        const res = await fetch(`${API_BASE}/addons`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders(token) },
          body: JSON.stringify({ addon_slug: def.slug, price_cents: def.defaultPriceCents, notes: null, species }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to enable add-on');
        }
      }
      await fetchAddons();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to update add-on');
      setMessageType('error');
    } finally {
      setAddonSaving(false);
    }
  };

  const handleAddonEdit = async (addon: SitterAddon, priceCents: number, notes: string | null) => {
    setAddonSaving(true);
    try {
      const res = await fetch(`${API_BASE}/addons/${addon.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders(token) },
        body: JSON.stringify({ price_cents: priceCents, notes }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update add-on');
      }
      await fetchAddons();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to update add-on');
      setMessageType('error');
    } finally {
      setAddonSaving(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    setMessageType('');

    try {
      // Save all species profiles in parallel
      await Promise.all(
        activeSpecies.map(async (species) => {
          const res = await fetch(`${API_BASE}/species-profiles/${species}`, {
            method: 'PUT',
            headers: getAuthHeaders(token),
            body: JSON.stringify(profiles[species]),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || `Failed to save ${formatSpecies(species)} profile`);
          }
        })
      );

      // Delete removed species in parallel
      const removedSpecies = (user?.accepted_species || []).filter((s: string) => !activeSpecies.includes(s));
      await Promise.all(
        removedSpecies.map((species) =>
          fetch(`${API_BASE}/species-profiles/${species}`, {
            method: 'DELETE',
            headers: getAuthHeaders(token),
          }).catch(() => {})
        )
      );

      // Save services in parallel
      await Promise.all(
        services
          .filter((svc) => svc.species && activeSpecies.includes(svc.species) && (svc.price_cents > 0 || svc.type === 'meet_greet'))
          .map(async (svc) => {
            const res = svc.id && svc.id > 0
              ? await fetch(`${API_BASE}/services/${svc.id}`, {
                  method: 'PUT',
                  headers: getAuthHeaders(token),
                  body: JSON.stringify({ price_cents: svc.price_cents, species: svc.species }),
                })
              : await fetch(`${API_BASE}/services`, {
                  method: 'POST',
                  headers: getAuthHeaders(token),
                  body: JSON.stringify({ type: svc.type, price_cents: svc.price_cents, species: svc.species }),
                });
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error(data.error || `Failed to save ${svc.type} service`);
            }
          })
      );

      // Update user's accepted_species + insurance + camera fields
      if (user) {
        const res = await fetch(`${API_BASE}/users/me`, {
          method: 'PUT',
          headers: getAuthHeaders(token),
          body: JSON.stringify({
            name: user.name,
            accepted_species: activeSpecies,
            has_insurance: hasInsurance,
            has_cameras: hasCameras,
            camera_locations: hasCameras ? cameraLocations : [],
            camera_policy_note: hasCameras ? cameraPolicyNote || null : null,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          updateUser(data.user);
        }
      }

      setMessage('Profile saved successfully');
      setMessageType('success');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Save failed');
      setMessageType('error');
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;
  if (loading) return <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" /></div>;

  const availableToAdd = ALL_SPECIES.filter((s) => !activeSpecies.includes(s));

  return (
    <div className="space-y-4">
      {/* Species Cards */}
      <div className="space-y-3">
        {activeSpecies.map((species) => (
          <SpeciesCard
            key={species}
            species={species}
            profile={profiles[species] || {}}
            services={services.filter((s) => s.species === species)}
            addons={addons.filter((a) => a.species === species)}
            onProfileChange={(p) => updateProfile(species, p)}
            onServicePriceChange={(type, price) => updateServicePrice(species, type, price)}
            onAddonToggle={(def) => handleAddonToggle(species, def)}
            onAddonEdit={handleAddonEdit}
            addonSaving={addonSaving}
            onRemove={() => removeSpecies(species)}
            defaultCollapsed={!newlyAdded.has(species)}
          />
        ))}
      </div>

      {/* Add Species */}
      {availableToAdd.length > 0 && (
        <div className="border-2 border-dashed border-stone-300 rounded-2xl p-4 text-center hover:border-emerald-400 transition-colors">
          <div className="text-sm font-bold text-emerald-600 mb-2">+ Add another species</div>
          <div className="flex justify-center gap-2">
            {availableToAdd.map((species) => (
              <button
                key={species}
                type="button"
                onClick={() => addSpecies(species)}
                className="bg-stone-100 text-stone-600 px-3 py-1.5 rounded-full text-xs font-semibold hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
              >
                {SPECIES_ICONS[species]} {formatSpecies(species)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Insurance */}
      <div className="border border-stone-200 rounded-2xl p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-stone-900">Insurance</h3>
            <p className="text-xs text-stone-500">I carry pet sitter insurance</p>
          </div>
          <Toggle checked={hasInsurance} onChange={() => setHasInsurance((prev) => !prev)} />
        </div>
      </div>

      {/* Camera Disclosure */}
      <div className="border border-stone-200 rounded-2xl p-4 space-y-4">
        <div className="flex items-center gap-2 mb-1">
          <Camera className="w-5 h-5 text-emerald-600" />
          <h3 className="text-sm font-bold text-stone-900">Camera Disclosure</h3>
        </div>

        <div className="flex items-center justify-between">
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
        <div className="bg-stone-50 rounded-xl p-4 space-y-3">
          <h4 className="text-xs font-semibold text-stone-700 uppercase tracking-wide flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5" /> Camera Best Practices
          </h4>
          {getCameraGuidelines().map((g) => {
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

      {/* Message */}
      {message && (
        <div className={`text-sm text-center p-2 rounded-lg ${
          messageType === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
        }`}>
          {message}
        </div>
      )}

      {/* Save */}
      <button
        type="button"
        onClick={handleSave}
        disabled={saving || activeSpecies.length === 0}
        className="w-full bg-emerald-600 text-white py-3 rounded-lg font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <Save className="w-4 h-4" />
        {saving ? 'Saving...' : 'Save Profile'}
      </button>
    </div>
  );
}
