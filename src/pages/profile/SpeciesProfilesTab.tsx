import { useState, useEffect } from 'react';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { Save } from 'lucide-react';
import { API_BASE } from '../../config';
import type { SitterSpeciesProfile, Service } from '../../types';
import SpeciesCard from '../../components/profile/SpeciesCard';
import { SPECIES_ICONS, formatSpecies } from '../../shared/species-utils';

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

  // Fetch existing profiles and services
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();

    Promise.all([
      fetch(`${API_BASE}/species-profiles/me`, { headers: getAuthHeaders(token), signal: controller.signal }),
      fetch(`${API_BASE}/services/me`, { headers: getAuthHeaders(token), signal: controller.signal }),
    ])
      .then(async ([profilesRes, servicesRes]) => {
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

  const updateServicePrice = (species: string, serviceType: string, price: number) => {
    setServices((prev) => {
      const existing = prev.find((s) => s.type === serviceType && s.species === species);
      if (existing) {
        return prev.map((s) => s.type === serviceType && s.species === species ? { ...s, price } : s);
      }
      return [...prev, { id: 0, sitter_id: user?.id || 0, type: serviceType as Service['type'], price, species } as Service];
    });
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
          .filter((svc) => svc.species && activeSpecies.includes(svc.species) && (svc.price > 0 || svc.type === 'meet_greet'))
          .map(async (svc) => {
            const res = svc.id && svc.id > 0
              ? await fetch(`${API_BASE}/services/${svc.id}`, {
                  method: 'PUT',
                  headers: getAuthHeaders(token),
                  body: JSON.stringify({ price: svc.price, species: svc.species }),
                })
              : await fetch(`${API_BASE}/services`, {
                  method: 'POST',
                  headers: getAuthHeaders(token),
                  body: JSON.stringify({ type: svc.type, price: svc.price, species: svc.species }),
                });
            if (!res.ok) {
              const data = await res.json().catch(() => ({}));
              throw new Error(data.error || `Failed to save ${svc.type} service`);
            }
          })
      );

      // Update user's accepted_species
      if (user) {
        const res = await fetch(`${API_BASE}/users/me`, {
          method: 'PUT',
          headers: getAuthHeaders(token),
          body: JSON.stringify({ name: user.name, accepted_species: activeSpecies }),
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
      <div>
        <h2 className="text-lg font-bold text-stone-900 mb-0.5">Sitter Profile</h2>
        <p className="text-xs text-stone-400">Each species you care for gets its own section with tailored options</p>
      </div>

      {/* Species Cards */}
      <div className="space-y-3">
        {activeSpecies.map((species) => (
          <SpeciesCard
            key={species}
            species={species}
            profile={profiles[species] || {}}
            services={services.filter((s) => s.species === species)}
            onProfileChange={(p) => updateProfile(species, p)}
            onServicePriceChange={(type, price) => updateServicePrice(species, type, price)}
            onRemove={() => removeSpecies(species)}
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
