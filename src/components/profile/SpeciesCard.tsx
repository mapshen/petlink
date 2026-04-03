import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { SitterSpeciesProfile, Service } from '../../types';
import { getAvailableServices, getServiceLabel, getAvailableSkills, type SkillOption } from '../../shared/service-labels';
import { SPECIES_ICONS, formatSpecies } from '../../shared/species-utils';
import { formatCentsDecimal } from '../../lib/money';

const SERVICE_ICONS: Record<string, string> = { walking: '🚶', sitting: '🏠', 'drop-in': '👋', daycare: '☀️', grooming: '✂️', meet_greet: '🤝' };
const SPECIES_COLORS: Record<string, { border: string; header: string; text: string }> = {
  dog: { border: 'border-blue-300', header: 'bg-blue-50', text: 'text-blue-900' },
  cat: { border: 'border-pink-300', header: 'bg-pink-50', text: 'text-pink-900' },
  bird: { border: 'border-yellow-300', header: 'bg-yellow-50', text: 'text-yellow-900' },
  reptile: { border: 'border-green-300', header: 'bg-green-50', text: 'text-green-900' },
  small_animal: { border: 'border-purple-300', header: 'bg-purple-50', text: 'text-purple-900' },
};

const DOG_SIZES = [
  { value: 'small', label: 'Small (0-15 lbs)' },
  { value: 'medium', label: 'Medium (16-40 lbs)' },
  { value: 'large', label: 'Large (41-100 lbs)' },
  { value: 'giant', label: 'Giant (101+ lbs)' },
];

interface SpeciesCardProps {
  readonly species: string;
  readonly profile: Partial<SitterSpeciesProfile>;
  readonly services: Service[];
  readonly onProfileChange: (profile: Partial<SitterSpeciesProfile>) => void;
  readonly onServicePriceChange: (serviceType: string, price: number) => void;
  readonly onRemove: () => void;
}

export default function SpeciesCard({ species, profile, services, onProfileChange, onServicePriceChange, onRemove }: SpeciesCardProps) {
  const [collapsed, setCollapsed] = useState(false);

  const colors = SPECIES_COLORS[species] || SPECIES_COLORS.dog;
  const isDog = species === 'dog';
  const showSizes = species === 'dog';
  const availableServiceTypes = getAvailableServices([species]);
  const availableSkills = getAvailableSkills([species]);

  const universalSkills = availableSkills.filter((s) => s.species === 'all');
  const speciesSkills = availableSkills.filter((s) => s.species !== 'all');

  const toggleSize = (size: string) => {
    const sizes = profile.accepted_pet_sizes || [];
    const updated = sizes.includes(size) ? sizes.filter((s) => s !== size) : [...sizes, size];
    onProfileChange({ ...profile, accepted_pet_sizes: updated });
  };

  const toggleSkill = (skill: string) => {
    const skills = profile.skills || [];
    const updated = skills.includes(skill) ? skills.filter((s) => s !== skill) : [...skills, skill];
    onProfileChange({ ...profile, skills: updated });
  };

  // Build summary for collapsed header
  const summaryParts: string[] = [];
  if (profile.years_experience) summaryParts.push(`${profile.years_experience} yrs`);
  summaryParts.push(`${services.length} services`);
  if (profile.accepted_pet_sizes && profile.accepted_pet_sizes.length > 0) {
    summaryParts.push(profile.accepted_pet_sizes.map((s) => s[0].toUpperCase()).join('/'));
  }
  if (isDog && profile.has_fenced_yard) summaryParts.push('fenced yard');

  return (
    <div className={`border-2 rounded-2xl overflow-hidden ${colors.border}`}>
      {/* Header */}
      <div className={`flex items-center justify-between px-5 py-3.5 ${colors.header}`}>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-3 flex-1 min-w-0"
          type="button"
        >
          <span className="text-xl">{SPECIES_ICONS[species]}</span>
          <div className="text-left">
            <div className={`text-[15px] font-extrabold ${colors.text}`}>{formatSpecies(species)}</div>
            <div className="text-[11px] text-stone-500">{summaryParts.join(' · ')}</div>
          </div>
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRemove}
            className="text-[11px] text-red-500 font-semibold hover:text-red-700 px-2"
            aria-label={`Remove ${formatSpecies(species)}`}
          >
            Remove
          </button>
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="p-1"
            aria-label={collapsed ? `Expand ${formatSpecies(species)}` : `Collapse ${formatSpecies(species)}`}
          >
            {collapsed ? <ChevronRight className="w-4 h-4 text-stone-400" /> : <ChevronDown className="w-4 h-4 text-stone-400" />}
          </button>
        </div>
      </div>

      {/* Body */}
      {!collapsed && (
        <div className="p-5 space-y-4">
          {/* Experience & Capacity */}
          <div>
            <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1.5">Experience & capacity</div>
            <div className={`grid gap-2 ${isDog ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <div>
                <label className="text-[11px] font-semibold text-stone-500 block mb-1">Years with {formatSpecies(species).toLowerCase()}s</label>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={profile.years_experience ?? ''}
                  onChange={(e) => onProfileChange({ ...profile, years_experience: e.target.value ? Number(e.target.value) : undefined })}
                  placeholder="0"
                  className="w-full p-2 border border-stone-200 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-stone-500 block mb-1">Max {formatSpecies(species).toLowerCase()}s at once</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={profile.max_pets ?? 1}
                  onChange={(e) => onProfileChange({ ...profile, max_pets: Number(e.target.value) || 1 })}
                  className="w-full p-2 border border-stone-200 rounded-lg text-sm"
                />
              </div>
              {isDog && (
                <div>
                  <label className="text-[11px] font-semibold text-stone-500 block mb-1">Max per walk</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={profile.max_pets_per_walk ?? 2}
                    onChange={(e) => onProfileChange({ ...profile, max_pets_per_walk: Number(e.target.value) || 2 })}
                    className="w-full p-2 border border-stone-200 rounded-lg text-sm"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Sizes */}
          {showSizes && (
            <div>
              <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1.5">{formatSpecies(species)} sizes</div>
              <div className="flex flex-wrap gap-1.5">
                {DOG_SIZES.map((size) => (
                  <button
                    key={size.value}
                    type="button"
                    onClick={() => toggleSize(size.value)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                      (profile.accepted_pet_sizes || []).includes(size.value) ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-600'
                    }`}
                  >
                    {size.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Skills */}
          <div>
            <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1.5">{formatSpecies(species)} skills</div>
            <div className="space-y-2">
              {universalSkills.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {universalSkills.map((skill) => (
                    <button
                      key={skill.value}
                      type="button"
                      onClick={() => toggleSkill(skill.value)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                        (profile.skills || []).includes(skill.value) ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-600'
                      }`}
                    >
                      {skill.label}
                    </button>
                  ))}
                </div>
              )}
              {speciesSkills.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {speciesSkills.map((skill) => (
                    <button
                      key={skill.value}
                      type="button"
                      onClick={() => toggleSkill(skill.value)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${
                        (profile.skills || []).includes(skill.value) ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-600'
                      }`}
                    >
                      {skill.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Dog-specific environment */}
          {isDog && (
            <div>
              <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1.5">Dog environment</div>
              <div className="flex flex-wrap gap-3 text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={profile.has_yard ?? false} onChange={(e) => { onProfileChange({ ...profile, has_yard: e.target.checked, has_fenced_yard: e.target.checked ? profile.has_fenced_yard : false }); }} className="rounded text-emerald-600" />
                  Has yard
                </label>
                {profile.has_yard && (
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={profile.has_fenced_yard ?? false} onChange={(e) => onProfileChange({ ...profile, has_fenced_yard: e.target.checked })} className="rounded text-emerald-600" />
                    Fenced
                  </label>
                )}
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={profile.dogs_on_furniture ?? false} onChange={(e) => onProfileChange({ ...profile, dogs_on_furniture: e.target.checked })} className="rounded text-emerald-600" />
                  On furniture
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={profile.dogs_on_bed ?? false} onChange={(e) => onProfileChange({ ...profile, dogs_on_bed: e.target.checked })} className="rounded text-emerald-600" />
                  On bed
                </label>
              </div>
            </div>
          )}

          {/* Own pets of this species */}
          <div>
            <label className="flex items-center gap-1.5 cursor-pointer text-xs mb-1">
              <input type="checkbox" checked={profile.owns_same_species ?? false} onChange={(e) => onProfileChange({ ...profile, owns_same_species: e.target.checked })} className="rounded text-emerald-600" />
              I have my own {formatSpecies(species).toLowerCase()}s
            </label>
            {profile.owns_same_species && (
              <input
                value={profile.own_pets_description ?? ''}
                onChange={(e) => onProfileChange({ ...profile, own_pets_description: e.target.value })}
                placeholder={`Describe your ${formatSpecies(species).toLowerCase()}s...`}
                className="w-full p-2 bg-stone-50 border-none rounded-lg text-xs mt-1"
              />
            )}
          </div>

          {/* Services & Pricing */}
          <div>
            <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1.5">{formatSpecies(species)} services & pricing</div>
            <div className="space-y-1">
              {availableServiceTypes.map((type) => {
                const svc = services.find((s) => s.type === type);
                const label = getServiceLabel(type, [species]);

                return (
                  <div key={type} className={`flex items-center justify-between p-2.5 border rounded-lg ${type === 'meet_greet' ? 'border-dashed bg-stone-50' : 'border-stone-200'}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{SERVICE_ICONS[type] || '📋'}</span>
                      <span className="text-xs font-semibold">{label}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-stone-400">$</span>
                      <input
                        type="number"
                        min={0}
                        max={9999}
                        step="0.01"
                        value={svc?.price_cents != null ? formatCentsDecimal(svc.price_cents) : ''}
                        onChange={(e) => onServicePriceChange(type, Math.round(Math.max(0, Math.min(9999, Number(e.target.value) || 0)) * 100))}
                        placeholder="—"
                        aria-label={`Price for ${label}`}
                        className="w-16 p-1.5 border border-stone-200 rounded-md text-sm font-bold text-right"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
