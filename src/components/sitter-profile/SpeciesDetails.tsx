import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { SitterSpeciesProfile, Service } from '../../types';
import { getServiceLabel } from '../../shared/service-labels';
import { formatSpecies } from '../../shared/species-utils';
import { formatCents } from '../../lib/money';
import { formatSkill } from './SitterProfileHeader';

const SERVICE_ICONS: Record<string, string> = { walking: '🚶', sitting: '🏠', 'drop-in': '👋', daycare: '☀️', grooming: '✂️', meet_greet: '🤝', boarding: '🏡' };
const SIZE_LABELS: Record<string, string> = { small: 'Small (0-15 lbs)', medium: 'Medium (16-40 lbs)', large: 'Large (41-100 lbs)', giant: 'Giant (101+ lbs)' };

export interface SpeciesBadge {
  species: string;
  emoji: string;
  label: string;
  years?: number;
}

export function buildSpeciesBadges(profiles: SitterSpeciesProfile[]): SpeciesBadge[] {
  const SPECIES_ICONS_MAP: Record<string, string> = { dog: '🐕', cat: '🐱', bird: '🐦', reptile: '🦎', small_animal: '🐹' };
  return profiles.map((p) => ({
    species: p.species,
    emoji: SPECIES_ICONS_MAP[p.species] || '🐾',
    label: formatSpecies(p.species),
    years: p.years_experience,
  }));
}

export function getServicesForSpecies(services: Service[], species: string | null): Service[] {
  if (!species) return services;
  return services.filter((s) => s.species === species);
}

function CollapsibleSection({ title, defaultOpen = true, children }: { readonly title: string; readonly defaultOpen?: boolean; readonly children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full text-left px-5 py-3 flex items-center justify-between"
      >
        <h3 className="text-sm font-bold text-stone-900">{title}</h3>
        {open ? <ChevronDown className="w-4 h-4 text-stone-400" /> : <ChevronRight className="w-4 h-4 text-stone-400" />}
      </button>
      {open && <div className="px-5 pb-4">{children}</div>}
    </div>
  );
}

interface Props {
  readonly profile: SitterSpeciesProfile;
  readonly services: Service[];
}

export default function SpeciesDetails({ profile, services }: Props) {
  const isDog = profile.species === 'dog';
  const speciesServices = getServicesForSpecies(services, profile.species);

  return (
    <div className="py-6 px-4" role="tabpanel" aria-label={`${formatSpecies(profile.species)} details`}>
      <div className="max-w-2xl mx-auto space-y-2">
        {/* Services & Pricing — expanded by default */}
        {speciesServices.length > 0 && (
          <CollapsibleSection title="Services & Pricing" defaultOpen>
            <div className="space-y-2">
              {speciesServices.map((svc) => (
                <div key={svc.id} className="flex items-center justify-between p-3 bg-stone-50 rounded-xl">
                  <div className="flex items-center gap-2">
                    <span>{SERVICE_ICONS[svc.type] || '📋'}</span>
                    <span className="text-sm font-semibold text-stone-900">{getServiceLabel(svc.type, [profile.species])}</span>
                  </div>
                  <span className="text-sm font-bold text-emerald-600">
                    {svc.price_cents === 0 ? 'Free' : formatCents(svc.price_cents)}
                  </span>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Experience & Capacity */}
        <CollapsibleSection title="Experience & Capacity">
          <div className="flex flex-wrap gap-4 text-sm">
            {profile.years_experience != null && (
              <div>
                <span className="font-extrabold text-lg text-emerald-600">{profile.years_experience}</span>
                <span className="text-stone-500 ml-1">years experience</span>
              </div>
            )}
            <div>
              <span className="font-extrabold text-lg text-emerald-600">{profile.max_pets}</span>
              <span className="text-stone-500 ml-1">max pets at once</span>
            </div>
            {isDog && profile.max_pets_per_walk && (
              <div>
                <span className="font-extrabold text-lg text-emerald-600">{profile.max_pets_per_walk}</span>
                <span className="text-stone-500 ml-1">max per walk</span>
              </div>
            )}
          </div>
        </CollapsibleSection>

        {/* Accepted Sizes — dogs only */}
        {isDog && profile.accepted_pet_sizes.length > 0 && (
          <CollapsibleSection title="Accepted Sizes">
            <div className="flex flex-wrap gap-2">
              {profile.accepted_pet_sizes.map((size) => (
                <span key={size} className="bg-emerald-50 text-emerald-700 text-xs font-semibold px-3 py-1.5 rounded-full">
                  {SIZE_LABELS[size] || size}
                </span>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Skills */}
        {profile.skills.length > 0 && (
          <CollapsibleSection title="Skills & Certifications">
            <div className="flex flex-wrap gap-2">
              {profile.skills.map((skill) => (
                <span key={skill} className="bg-stone-100 text-stone-700 text-xs font-semibold px-3 py-1.5 rounded-full">
                  {formatSkill(skill)}
                </span>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Environment (dog-specific) */}
        {isDog && (
          <CollapsibleSection title="Home Environment">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <EnvironmentItem label="Yard" value={profile.has_yard} />
              <EnvironmentItem label="Fenced yard" value={profile.has_fenced_yard} />
              <EnvironmentItem label="Dogs on furniture" value={profile.dogs_on_furniture} />
              <EnvironmentItem label="Dogs on bed" value={profile.dogs_on_bed} />
              {profile.potty_break_frequency && (
                <div className="col-span-2 text-stone-600">
                  <span className="font-medium">Potty breaks:</span> {profile.potty_break_frequency}
                </div>
              )}
            </div>
          </CollapsibleSection>
        )}

        {/* Pet Preferences */}
        <CollapsibleSection title="Pet Preferences">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <EnvironmentItem label="Accepts puppies/kittens" value={profile.accepts_puppies} />
            <EnvironmentItem label="Accepts unspayed" value={profile.accepts_unspayed} />
            <EnvironmentItem label="Accepts unneutered" value={profile.accepts_unneutered} />
          </div>
        </CollapsibleSection>

        {/* Own Pets */}
        {profile.owns_same_species && (
          <CollapsibleSection title={`My ${formatSpecies(profile.species)}s`}>
            <p className="text-sm text-stone-600">{profile.own_pets_description || `Has own ${formatSpecies(profile.species).toLowerCase()}s`}</p>
          </CollapsibleSection>
        )}
      </div>
    </div>
  );
}

function EnvironmentItem({ label, value }: { readonly label: string; readonly value: boolean }) {
  return (
    <div className="flex items-center gap-2 text-stone-600">
      <span className={value ? 'text-emerald-500' : 'text-stone-300'}>{value ? '✓' : '✗'}</span>
      <span>{label}</span>
    </div>
  );
}
