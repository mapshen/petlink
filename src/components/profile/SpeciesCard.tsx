import { useState } from 'react';
import { ChevronDown, ChevronRight, Save, X } from 'lucide-react';
import type { SitterSpeciesProfile, Service, SitterAddon } from '../../types';
import { getAvailableServices, getServiceLabel, getAvailableSkills, type SkillOption } from '../../shared/service-labels';
import { SPECIES_ICONS, formatSpecies } from '../../shared/species-utils';
import { formatCentsDecimal } from '../../lib/money';
import { formatCents } from '../../lib/money';
import { ADDON_CATALOG, type AddonDefinition } from '../../shared/addon-catalog';

const SERVICE_ICONS: Record<string, string> = { walking: '🚶', sitting: '🏠', 'drop-in': '👋', daycare: '☀️', grooming: '✂️', meet_greet: '🤝', boarding: '🏡' };
// Unified brand-consistent style — emerald stripe, no rainbow
const SPECIES_STYLE = { border: 'border-stone-200', text: 'text-stone-900' };

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
  readonly addons: SitterAddon[];
  readonly onProfileChange: (profile: Partial<SitterSpeciesProfile>) => void;
  readonly onServicePriceChange: (serviceType: string, price: number) => void;
  readonly onAddonToggle: (def: AddonDefinition) => void;
  readonly onAddonEdit: (addon: SitterAddon, priceCents: number, notes: string | null) => void;
  readonly addonSaving?: boolean;
  readonly onRemove: () => void;
  readonly defaultCollapsed?: boolean;
}

export default function SpeciesCard({ species, profile, services, addons, onProfileChange, onServicePriceChange, onAddonToggle, onAddonEdit, addonSaving, onRemove, defaultCollapsed = true }: SpeciesCardProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [editingAddonSlug, setEditingAddonSlug] = useState<string | null>(null);
  const [editAddonPrice, setEditAddonPrice] = useState('');
  const [editAddonNotes, setEditAddonNotes] = useState('');

  const colors = SPECIES_STYLE;
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

  // Filter catalog addons for this species + its active service types
  const activeServiceTypes = new Set(services.filter((s) => s.price_cents > 0 || s.type === 'meet_greet').map((s) => s.type));
  const speciesAddons = ADDON_CATALOG.filter((def) => {
    const speciesMatch = def.species === 'all' || def.species.includes(species as 'dog' | 'cat' | 'bird' | 'reptile' | 'small_animal');
    const serviceMatch = def.applicableServices.some((st) => activeServiceTypes.has(st));
    return speciesMatch && serviceMatch;
  });
  const enabledAddonSlugs = new Set(addons.map((a) => a.addon_slug));

  const startEditingAddon = (addon: SitterAddon) => {
    setEditingAddonSlug(addon.addon_slug);
    setEditAddonPrice((addon.price_cents / 100).toFixed(2));
    setEditAddonNotes(addon.notes || '');
  };

  const saveAddonEdit = (addon: SitterAddon) => {
    const priceCents = Math.round(parseFloat(editAddonPrice) * 100);
    if (isNaN(priceCents) || priceCents < 0 || priceCents > 50000) return;
    onAddonEdit(addon, priceCents, editAddonNotes || null);
    setEditingAddonSlug(null);
  };

  // Build summary for collapsed header
  const summaryParts: string[] = [];
  if (profile.years_experience) summaryParts.push(`${profile.years_experience} yrs`);
  summaryParts.push(`${services.length} services`);
  if (showSizes && profile.accepted_pet_sizes && profile.accepted_pet_sizes.length > 0) {
    summaryParts.push(profile.accepted_pet_sizes.map((s) => s[0].toUpperCase()).join('/'));
  }

  return (
    <div className={`border rounded-2xl overflow-hidden ${colors.border} flex`}>
      <div className="w-1 bg-emerald-500 flex-shrink-0" />
      <div className="flex-1">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-3 flex-1 min-w-0"
          type="button"
        >
          <span className="text-xl">{SPECIES_ICONS[species]}</span>
          <div className="text-left">
            <div className="text-[15px] font-extrabold text-stone-900">{formatSpecies(species)}</div>
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

          {/* Add-ons */}
          {speciesAddons.length > 0 && (
            <div>
              <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-1.5">{formatSpecies(species)} add-ons</div>
              <div className="border border-stone-200 rounded-xl divide-y divide-stone-100">
                {speciesAddons.map((def) => {
                  const enabled = enabledAddonSlugs.has(def.slug);
                  const addon = addons.find((a) => a.addon_slug === def.slug);
                  const isEditing = editingAddonSlug === def.slug;

                  return (
                    <div key={def.slug} className="px-3 py-2">
                      <div className="flex items-center gap-2.5">
                        <span className="text-sm flex-shrink-0">{def.emoji}</span>
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => enabled && addon && !isEditing ? startEditingAddon(addon) : undefined}
                          tabIndex={enabled && !isEditing ? 0 : -1}
                        >
                          <span className="text-xs font-semibold text-stone-900 block">{def.label}</span>
                          <span className="text-[10px] text-stone-400 leading-snug block">{def.description}</span>
                        </button>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {enabled && addon && !isEditing && (
                            <span className="text-[11px] font-medium text-emerald-700">
                              {addon.price_cents === 0 ? 'Free' : formatCents(addon.price_cents)}
                            </span>
                          )}
                          <button
                            type="button"
                            role="switch"
                            aria-checked={enabled}
                            aria-label={`Toggle ${def.label}`}
                            onClick={() => onAddonToggle(def)}
                            disabled={addonSaving}
                            className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${enabled ? 'bg-emerald-500' : 'bg-stone-300'}`}
                          >
                            <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transform transition-transform ${enabled ? 'translate-x-3' : 'translate-x-0.5'}`} />
                          </button>
                        </div>
                      </div>

                      {enabled && addon && isEditing && (
                        <div className="mt-2 ml-6 space-y-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-stone-500">$</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max="500"
                              value={editAddonPrice}
                              onChange={(e) => setEditAddonPrice(e.target.value)}
                              className="w-20 p-1 border border-stone-200 rounded-md text-xs text-right"
                            />
                            <span className="text-[10px] text-stone-400">/ {def.pricingUnit}</span>
                          </div>
                          <input
                            placeholder="Optional note..."
                            value={editAddonNotes}
                            onChange={(e) => setEditAddonNotes(e.target.value)}
                            maxLength={500}
                            className="w-full p-1 border border-stone-200 rounded-md text-[11px]"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => saveAddonEdit(addon)}
                              disabled={addonSaving}
                              className="inline-flex items-center gap-0.5 text-[11px] font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
                            >
                              <Save className="w-3 h-3" /> Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingAddonSlug(null)}
                              className="inline-flex items-center gap-0.5 text-[11px] text-stone-400 hover:text-stone-600"
                            >
                              <X className="w-3 h-3" /> Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
