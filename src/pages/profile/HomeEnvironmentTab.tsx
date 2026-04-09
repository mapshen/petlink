import { useState, useEffect } from 'react';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { Save } from 'lucide-react';
import { API_BASE } from '../../config';
import type { HomeType, SitterSpeciesProfile } from '../../types';

const HOME_TYPES: { value: HomeType; label: string; icon: string }[] = [
  { value: 'house', label: 'House', icon: '🏠' },
  { value: 'apartment', label: 'Apartment', icon: '🏢' },
  { value: 'condo', label: 'Condo', icon: '🏬' },
  { value: 'other', label: 'Other', icon: '🏡' },
];

const POTTY_OPTIONS = [
  { value: 'every 2 hours', label: 'Every 2 hours' },
  { value: '2-4 hours', label: 'Every 2-4 hours' },
  { value: '4-6 hours', label: 'Every 4-6 hours' },
  { value: '6+ hours', label: '6+ hours' },
];

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-stone-700">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${checked ? 'bg-emerald-500' : 'bg-stone-300'}`}
      >
        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
    </div>
  );
}

export default function HomeEnvironmentTab() {
  const { user, token, updateUser } = useAuth();

  const [homeType, setHomeType] = useState<HomeType | ''>('');
  const [hasYard, setHasYard] = useState(false);
  const [hasFencedYard, setHasFencedYard] = useState(false);
  const [nonSmoking, setNonSmoking] = useState(false);
  const [childrenInHome, setChildrenInHome] = useState(false);
  const [childrenAges, setChildrenAges] = useState('');
  const [hasOwnPets, setHasOwnPets] = useState(false);
  const [ownPetsDescription, setOwnPetsDescription] = useState('');
  const [houseRules, setHouseRules] = useState('');

  // Dog-specific fields
  const [dogsOnBed, setDogsOnBed] = useState(false);
  const [dogsOnFurniture, setDogsOnFurniture] = useState(false);
  const [pottyBreakFrequency, setPottyBreakFrequency] = useState('');
  const [dogProfileLoaded, setDogProfileLoaded] = useState(false);

  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const hasDog = user?.accepted_species?.includes('dog') ?? false;

  useEffect(() => {
    if (!user) return;
    setHomeType(user.home_type || '');
    setHasYard(user.has_yard ?? false);
    setHasFencedYard(user.has_fenced_yard ?? false);
    setNonSmoking(user.non_smoking_home ?? false);
    setChildrenInHome(user.children_in_home ?? false);
    setChildrenAges(user.children_ages || '');
    setHasOwnPets(user.has_own_pets ?? false);
    setOwnPetsDescription(user.own_pets_description || '');
    setHouseRules(user.house_rules || '');
  }, [user]);

  // Fetch dog species profile for dog-specific fields
  useEffect(() => {
    if (!hasDog || !user || dogProfileLoaded) return;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/species-profiles/me`, {
          headers: getAuthHeaders(token),
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        const dogProfile = (data.profiles as SitterSpeciesProfile[]).find(
          (p) => p.species === 'dog',
        );
        if (dogProfile) {
          setDogsOnBed(dogProfile.dogs_on_bed ?? false);
          setDogsOnFurniture(dogProfile.dogs_on_furniture ?? false);
          setPottyBreakFrequency(dogProfile.potty_break_frequency || '');
        }
        setDogProfileLoaded(true);
      } catch {
        // ignore abort / network errors
      }
    })();
    return () => controller.abort();
  }, [hasDog, user, token, dogProfileLoaded]);

  if (!user) return null;

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      // Save user fields
      const userRes = await fetch(`${API_BASE}/users/me`, {
        method: 'PUT',
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          name: user.name,
          home_type: homeType || null,
          has_yard: hasYard,
          has_fenced_yard: hasYard ? hasFencedYard : false,
          non_smoking_home: nonSmoking,
          children_in_home: childrenInHome,
          children_ages: childrenInHome ? childrenAges || null : null,
          has_own_pets: hasOwnPets,
          own_pets_description: hasOwnPets ? ownPetsDescription || null : null,
          house_rules: houseRules || null,
        }),
      });
      if (!userRes.ok) throw new Error('Failed to save');
      const userData = await userRes.json();
      updateUser(userData.user);

      // Save dog species profile fields if applicable
      if (hasDog) {
        const dogRes = await fetch(`${API_BASE}/species-profiles/dog`, {
          method: 'PUT',
          headers: getAuthHeaders(token),
          body: JSON.stringify({
            dogs_on_bed: dogsOnBed,
            dogs_on_furniture: dogsOnFurniture,
            potty_break_frequency: pottyBreakFrequency || null,
          }),
        });
        if (!dogRes.ok) throw new Error('Failed to save dog environment settings');
      }

      setMessage('Settings saved');
      setTimeout(() => setMessage(''), 3000);
    } catch {
      setMessage('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {/* Home Type */}
      <div className="py-4">
        <div className="text-sm font-medium text-stone-700 mb-2">Home Type</div>
        <div className="grid grid-cols-2 gap-2">
          {HOME_TYPES.map((ht) => (
            <button
              key={ht.value}
              type="button"
              onClick={() => setHomeType(ht.value)}
              className={`p-3 rounded-xl border-2 text-left transition-colors ${
                homeType === ht.value
                  ? 'border-emerald-500 bg-emerald-50'
                  : 'border-stone-200 hover:border-stone-300 bg-white'
              }`}
            >
              <span className="text-lg">{ht.icon}</span>
              <div className="text-sm font-medium text-stone-900 mt-1">{ht.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Yard */}
      <div className="border-t py-4 space-y-3">
        <Toggle label="Has yard" checked={hasYard} onChange={() => {
          setHasYard((prev) => {
            if (prev) setHasFencedYard(false);
            return !prev;
          });
        }} />
        {hasYard && (
          <Toggle label="Fenced yard" checked={hasFencedYard} onChange={() => setHasFencedYard((prev) => !prev)} />
        )}
      </div>

      {/* Household */}
      <div className="border-t py-4 space-y-3">
        <Toggle label="Non-smoking household" checked={nonSmoking} onChange={() => setNonSmoking((prev) => !prev)} />
        <Toggle label="Children present" checked={childrenInHome} onChange={() => setChildrenInHome((prev) => !prev)} />
        {childrenInHome && (
          <div className="ml-1">
            <label className="block text-xs font-medium text-stone-500 mb-1">Children ages</label>
            <input
              type="text"
              value={childrenAges}
              onChange={(e) => setChildrenAges(e.target.value)}
              placeholder="e.g., 5 and 8"
              className="max-w-xs w-full p-2.5 border border-stone-200 rounded-lg text-sm"
            />
          </div>
        )}
      </div>

      {/* Pets */}
      <div className="border-t py-4 space-y-3">
        <Toggle label="I have my own pets" checked={hasOwnPets} onChange={() => setHasOwnPets((prev) => !prev)} />
        {hasOwnPets && (
          <textarea
            rows={2}
            value={ownPetsDescription}
            onChange={(e) => setOwnPetsDescription(e.target.value)}
            placeholder="Describe your pets (breed, age, temperament)..."
            className="w-full p-3 border border-stone-200 rounded-lg text-sm resize-none"
          />
        )}
      </div>

      {/* Dog Environment */}
      {hasDog && (
        <div className="border-t py-4 space-y-3">
          <div className="text-sm font-medium text-stone-700 mb-1">Dog Environment</div>
          <Toggle label="Dogs allowed on bed" checked={dogsOnBed} onChange={() => setDogsOnBed((prev) => !prev)} />
          <Toggle label="Dogs allowed on furniture" checked={dogsOnFurniture} onChange={() => setDogsOnFurniture((prev) => !prev)} />
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Potty break frequency</label>
            <select
              value={pottyBreakFrequency}
              onChange={(e) => setPottyBreakFrequency(e.target.value)}
              className="max-w-xs w-full p-2.5 border border-stone-200 rounded-lg text-sm bg-white"
            >
              <option value="">Not specified</option>
              {POTTY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* House Rules */}
      <div className="border-t py-4">
        <label className="block text-sm font-medium text-stone-700 mb-1">House Rules</label>
        <textarea
          rows={3}
          value={houseRules}
          onChange={(e) => setHouseRules(e.target.value)}
          placeholder="E.g., pets must be up to date on vaccinations, no aggressive dogs..."
          className="w-full p-3 border border-stone-200 rounded-lg text-sm resize-none"
        />
      </div>

      {/* Save */}
      <div className="border-t pt-4 flex items-center justify-end gap-3">
        {message && (
          <span className={`text-xs ${message.includes('saved') ? 'text-emerald-600' : 'text-red-600'}`}>
            {message}
          </span>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
