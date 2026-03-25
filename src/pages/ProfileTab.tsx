import React, { useState, useEffect, useRef } from 'react';
import { useAuth, getAuthHeaders } from '../context/AuthContext';
import { Save, Camera, Loader2, AlertCircle } from 'lucide-react';
import { API_BASE } from '../config';
import { useImageUpload } from '../hooks/useImageUpload';
import LinkedAccounts from '../components/LinkedAccounts';
import { useMode } from '../context/ModeContext';

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
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function ProfileTab() {
  const { user, token, updateUser } = useAuth();
  const { mode } = useMode();

  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [role, setRole] = useState<'owner' | 'sitter' | 'both'>('owner');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploading, progress, error: uploadError, upload, clearError } = useImageUpload(token);

  // Sitter-specific fields
  const [acceptedSpecies, setAcceptedSpecies] = useState<string[]>([]);
  const [yearsExperience, setYearsExperience] = useState('');
  const [homeType, setHomeType] = useState('');
  const [hasYard, setHasYard] = useState(false);
  const [hasFencedYard, setHasFencedYard] = useState(false);
  const [hasOwnPets, setHasOwnPets] = useState(false);
  const [ownPetsDescription, setOwnPetsDescription] = useState('');
  const [skills, setSkills] = useState<string[]>([]);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    clearError();
    const url = await upload(file, 'avatars');
    if (url) setAvatarUrl(url);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setBio(user.bio || '');
    setAvatarUrl(user.avatar_url || '');
    setRole(user.role);
    setAcceptedSpecies(user.accepted_species || []);
    setYearsExperience(user.years_experience?.toString() || '');
    setHomeType(user.home_type || '');
    setHasYard(user.has_yard || false);
    setHasFencedYard(user.has_fenced_yard || false);
    setHasOwnPets(user.has_own_pets || false);
    setOwnPetsDescription(user.own_pets_description || '');
    setSkills(user.skills || []);
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
          name, bio, avatar_url: avatarUrl, role,
          accepted_species: acceptedSpecies,
          years_experience: yearsExperience ? Number(yearsExperience) : null,
          home_type: homeType || null,
          has_yard: hasYard,
          has_fenced_yard: hasFencedYard,
          has_own_pets: hasOwnPets,
          own_pets_description: ownPetsDescription || null,
          skills,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Update failed');
      }

      const data = await res.json();
      updateUser(data.user);
      setMessage('Profile updated successfully');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const enableBothRoles = () => setRole('both');

  const toggleSpecies = (species: string) => {
    setAcceptedSpecies(prev =>
      prev.includes(species) ? prev.filter(s => s !== species) : [...prev, species]
    );
  };

  const toggleSkill = (skill: string) => {
    setSkills(prev =>
      prev.includes(skill) ? prev.filter(s => s !== skill) : [...prev, skill]
    );
  };

  const isSitter = role === 'sitter' || role === 'both';
  const showSitterFields = isSitter && (mode === 'sitter' || role !== 'both');

  if (!user) return null;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <h2 className="text-lg font-bold text-stone-900">Profile Settings</h2>

      {/* Avatar upload */}
      <div className="flex items-center gap-4">
        <div className="relative group">
          <img
            src={avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}`}
            alt={name}
            className="w-20 h-20 rounded-full border-4 border-emerald-50 object-cover"
          />
          <button
            type="button"
            aria-label={uploading ? 'Uploading photo' : 'Change profile photo'}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            {uploading ? (
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            ) : (
              <Camera className="w-5 h-5 text-white" />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleAvatarUpload}
            className="hidden"
            aria-label="Upload profile photo"
          />
        </div>
        <div className="flex-grow">
          <p className="text-sm font-medium text-stone-700">Profile Photo</p>
          <p className="text-xs text-stone-400 mt-0.5">JPEG, PNG, WebP or GIF. Max 5MB.</p>
          {uploading && (
            <div className="mt-2 w-full bg-stone-100 rounded-full h-1.5">
              <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}
          {uploadError && (
            <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> {uploadError}
            </p>
          )}
        </div>
      </div>

      {/* Name */}
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Name</label>
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
        />
      </div>

      {/* Bio */}
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Bio</label>
        <textarea
          rows={4}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="Tell us about yourself..."
          className="w-full p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
        />
      </div>

      {/* Role toggle */}
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-3">Account Mode</label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setRole('owner')}
            className={`flex-1 p-3 rounded-lg border text-sm font-medium transition-all ${
              role === 'owner' || role === 'both'
                ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                : 'border-stone-200 text-stone-500 hover:border-emerald-200'
            }`}
          >
            Pet Parent
          </button>
          <button
            type="button"
            onClick={() => setRole('sitter')}
            className={`flex-1 p-3 rounded-lg border text-sm font-medium transition-all ${
              role === 'sitter' || role === 'both'
                ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                : 'border-stone-200 text-stone-500 hover:border-emerald-200'
            }`}
          >
            Sitter
          </button>
          <button
            type="button"
            onClick={enableBothRoles}
            className={`flex-1 p-3 rounded-lg border text-sm font-medium transition-all ${
              role === 'both'
                ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                : 'border-stone-200 text-stone-500 hover:border-emerald-200'
            }`}
          >
            Both
          </button>
        </div>
      </div>

      {/* Sitter-specific fields */}
      {showSitterFields && (
        <div className="space-y-6 border-t border-stone-200 pt-6">
          <h3 className="text-sm font-bold text-stone-900">Sitter Details</h3>

          {/* Accepted Species */}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">Pet types I accept</label>
            <div className="flex flex-wrap gap-2">
              {SPECIES_OPTIONS.map(species => (
                <button key={species} type="button" onClick={() => toggleSpecies(species)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    acceptedSpecies.includes(species) ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}>
                  {formatSpecies(species)}
                </button>
              ))}
            </div>
          </div>

          {/* Experience */}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Years of experience</label>
            <input type="number" min={0} max={50} value={yearsExperience}
              onChange={e => setYearsExperience(e.target.value)}
              placeholder="0"
              className="w-32 p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500" />
          </div>

          {/* Skills */}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">Skills & certifications</label>
            <div className="flex flex-wrap gap-2">
              {SKILL_OPTIONS.map(skill => (
                <button key={skill.value} type="button" onClick={() => toggleSkill(skill.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    skills.includes(skill.value) ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                  }`}>
                  {skill.label}
                </button>
              ))}
            </div>
          </div>

          {/* Home Environment */}
          <div className="space-y-4">
            <h4 className="text-sm font-medium text-stone-700">Home environment</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <select value={homeType} onChange={e => setHomeType(e.target.value)}
                className="p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500 text-sm">
                {HOME_TYPES.map(h => <option key={h.value} value={h.value}>{h.label}</option>)}
              </select>
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={hasYard} onChange={e => { setHasYard(e.target.checked); if (!e.target.checked) setHasFencedYard(false); }}
                  className="rounded text-emerald-600 focus:ring-emerald-500" />
                <span className="text-sm text-stone-700">Has yard</span>
              </label>
              {hasYard && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={hasFencedYard} onChange={e => setHasFencedYard(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500" />
                  <span className="text-sm text-stone-700">Fenced yard</span>
                </label>
              )}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={hasOwnPets} onChange={e => setHasOwnPets(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500" />
                <span className="text-sm text-stone-700">Has own pets</span>
              </label>
            </div>
            {hasOwnPets && (
              <input value={ownPetsDescription} onChange={e => setOwnPetsDescription(e.target.value)}
                placeholder="Describe your pets (e.g., 1 cat, friendly with dogs)"
                className="w-full p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500 text-sm" />
            )}
          </div>
        </div>
      )}

      {message && (
        <div className={`text-sm text-center p-2 rounded-lg ${
          message.includes('success') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
        }`}>
          {message}
        </div>
      )}

      <button
        type="submit"
        disabled={saving || uploading}
        className="w-full bg-emerald-600 text-white py-3 rounded-lg font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        <Save className="w-4 h-4" />
        {saving ? 'Saving...' : 'Save Changes'}
      </button>

      <LinkedAccounts />
    </form>
  );
}
