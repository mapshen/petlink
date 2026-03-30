import { useState, useEffect } from 'react';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { Save } from 'lucide-react';
import { API_BASE } from '../../config';

const SPECIES_OPTIONS = ['dog', 'cat', 'bird', 'reptile', 'small_animal'] as const;
const HOME_TYPES = [
  { value: '', label: 'Select...' },
  { value: 'house', label: 'House' },
  { value: 'apartment', label: 'Apartment' },
  { value: 'condo', label: 'Condo' },
  { value: 'other', label: 'Other' },
] as const;
const SKILL_OPTIONS = [
  { value: 'pet_first_aid', label: 'Pet First Aid' },
  { value: 'dog_training', label: 'Dog Training' },
  { value: 'medication_admin', label: 'Medication Administration' },
  { value: 'puppy_care', label: 'Puppy Care' },
  { value: 'senior_pet_care', label: 'Senior Pet Care' },
  { value: 'behavioral_issues', label: 'Behavioral Issues' },
  { value: 'grooming_basics', label: 'Grooming Basics' },
] as const;

function formatSpecies(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function SitterInfoTab() {
  const { user, token, updateUser } = useAuth();

  const [acceptedPetSizes, setAcceptedPetSizes] = useState<string[]>([]);
  const [acceptedSpecies, setAcceptedSpecies] = useState<string[]>([]);
  const [yearsExperience, setYearsExperience] = useState('');
  const [homeType, setHomeType] = useState('');
  const [hasYard, setHasYard] = useState(false);
  const [hasFencedYard, setHasFencedYard] = useState(false);
  const [hasOwnPets, setHasOwnPets] = useState(false);
  const [ownPetsDescription, setOwnPetsDescription] = useState('');
  const [skills, setSkills] = useState<string[]>([]);
  const [maxPetsAtOnce, setMaxPetsAtOnce] = useState('3');
  const [maxPetsPerWalk, setMaxPetsPerWalk] = useState('2');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!user) return;
    setAcceptedPetSizes(user.accepted_pet_sizes || []);
    setAcceptedSpecies(user.accepted_species || []);
    setYearsExperience(user.years_experience?.toString() || '');
    setHomeType(user.home_type || '');
    setHasYard(user.has_yard || false);
    setHasFencedYard(user.has_fenced_yard || false);
    setHasOwnPets(user.has_own_pets || false);
    setOwnPetsDescription(user.own_pets_description || '');
    setSkills(user.skills || []);
    setMaxPetsAtOnce(user.max_pets_at_once?.toString() || '3');
    setMaxPetsPerWalk(user.max_pets_per_walk?.toString() || '2');
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
          accepted_pet_sizes: acceptedPetSizes,
          accepted_species: acceptedSpecies,
          years_experience: yearsExperience ? Number(yearsExperience) : null,
          home_type: homeType || null,
          has_yard: hasYard,
          has_fenced_yard: hasFencedYard,
          has_own_pets: hasOwnPets,
          own_pets_description: ownPetsDescription || null,
          skills,
          max_pets_at_once: maxPetsAtOnce ? Number(maxPetsAtOnce) : null,
          max_pets_per_walk: maxPetsPerWalk ? Number(maxPetsPerWalk) : null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Update failed');
      }
      const data = await res.json();
      updateUser(data.user);
      setMessage('Sitter info updated successfully');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const toggleSpecies = (species: string) => {
    setAcceptedSpecies((prev) =>
      prev.includes(species) ? prev.filter((s) => s !== species) : [...prev, species],
    );
  };

  const toggleSkill = (skill: string) => {
    setSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill],
    );
  };

  if (!user) return null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <h2 className="text-lg font-bold text-stone-900">Sitter Info</h2>

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-2">Pet types I accept</label>
        <div className="flex flex-wrap gap-2">
          {SPECIES_OPTIONS.map((species) => (
            <button
              key={species}
              type="button"
              onClick={() => toggleSpecies(species)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                acceptedSpecies.includes(species) ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              {formatSpecies(species)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-2">Pet sizes I accept</label>
        <div className="flex flex-wrap gap-2">
          {(['small', 'medium', 'large', 'giant'] as const).map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => setAcceptedPetSizes((prev) =>
                prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size]
              )}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                acceptedPetSizes.includes(size) ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              {size.charAt(0).toUpperCase() + size.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Years of experience</label>
          <input
            type="number"
            min={0}
            max={50}
            value={yearsExperience}
            onChange={(e) => setYearsExperience(e.target.value)}
            placeholder="0"
            className="w-full p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Home type</label>
          <select
            value={homeType}
            onChange={(e) => setHomeType(e.target.value)}
            className="w-full p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
          >
            {HOME_TYPES.map((h) => (
              <option key={h.value} value={h.value}>{h.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-2">Skills & certifications</label>
        <div className="flex flex-wrap gap-2">
          {SKILL_OPTIONS.map((skill) => (
            <button
              key={skill.value}
              type="button"
              onClick={() => toggleSkill(skill.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                skills.includes(skill.value) ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              {skill.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-medium text-stone-700 mb-3">Home environment</h4>
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={hasYard}
              onChange={(e) => { setHasYard(e.target.checked); if (!e.target.checked) setHasFencedYard(false); }}
              className="rounded text-emerald-600 focus:ring-emerald-500"
            />
            <span className="text-sm text-stone-700">Has yard</span>
          </label>
          {hasYard && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hasFencedYard}
                onChange={(e) => setHasFencedYard(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-sm text-stone-700">Fenced yard</span>
            </label>
          )}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={hasOwnPets}
              onChange={(e) => setHasOwnPets(e.target.checked)}
              className="rounded text-emerald-600 focus:ring-emerald-500"
            />
            <span className="text-sm text-stone-700">Has own pets</span>
          </label>
        </div>
        {hasOwnPets && (
          <input
            value={ownPetsDescription}
            onChange={(e) => setOwnPetsDescription(e.target.value)}
            placeholder="Describe your pets (e.g., 1 cat, friendly with dogs)"
            className="mt-3 w-full p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500 text-sm"
          />
        )}
      </div>

      <div>
        <h4 className="text-sm font-medium text-stone-700 mb-3">Pet capacity</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-stone-500 mb-1">Max pets at once</label>
            <input
              type="number"
              min={1}
              max={20}
              value={maxPetsAtOnce}
              onChange={(e) => setMaxPetsAtOnce(e.target.value)}
              className="w-full p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="block text-xs text-stone-500 mb-1">Max pets per walk</label>
            <input
              type="number"
              min={1}
              max={10}
              value={maxPetsPerWalk}
              onChange={(e) => setMaxPetsPerWalk(e.target.value)}
              className="w-full p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
            />
          </div>
        </div>
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
        {saving ? 'Saving...' : 'Save Sitter Info'}
      </button>
    </form>
  );
}
