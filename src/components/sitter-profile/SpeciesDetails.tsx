import type { SitterSpeciesProfile, Service } from '../../types';
import { getServiceLabel } from '../../shared/service-labels';
import { SPECIES_ICONS, formatSpecies } from '../../shared/species-utils';
import { formatSkill } from './SitterProfileHeader';

const SERVICE_ICONS: Record<string, string> = { walking: '🚶', sitting: '🏠', 'drop-in': '👋', daycare: '☀️', grooming: '✂️', meet_greet: '🤝' };
const SIZE_LABELS: Record<string, string> = { small: 'Small (0-15 lbs)', medium: 'Medium (16-40 lbs)', large: 'Large (41-100 lbs)', giant: 'Giant (101+ lbs)' };

export interface SpeciesBadge {
  species: string;
  emoji: string;
  label: string;
  years?: number;
}

export function buildSpeciesBadges(profiles: SitterSpeciesProfile[]): SpeciesBadge[] {
  return profiles.map((p) => ({
    species: p.species,
    emoji: SPECIES_ICONS[p.species] || '🐾',
    label: formatSpecies(p.species),
    years: p.years_experience,
  }));
}

export function getServicesForSpecies(services: Service[], species: string | null): Service[] {
  if (!species) return services;
  return services.filter((s) => s.species === species);
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
      <div className="max-w-2xl mx-auto space-y-4">
        {/* Experience & Capacity */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5">
          <h3 className="text-sm font-bold text-stone-900 mb-3">Experience & Capacity</h3>
          <div className="flex flex-wrap gap-4 text-sm">
            {profile.years_experience != null && (
              <div>
                <span className="font-extrabold text-lg text-emerald-600">{profile.years_experience}</span>
                <span className="text-stone-500 ml-1">years experience</span>
              </div>
            )}
            <div>
              <span className="font-extrabold text-lg text-emerald-600">{profile.max_pets}</span>
              <span className="text-stone-500 ml-1">max {formatSpecies(profile.species).toLowerCase()}s at once</span>
            </div>
            {isDog && profile.max_pets_per_walk && (
              <div>
                <span className="font-extrabold text-lg text-emerald-600">{profile.max_pets_per_walk}</span>
                <span className="text-stone-500 ml-1">max per walk</span>
              </div>
            )}
          </div>
        </div>

        {/* Accepted Sizes */}
        {profile.accepted_pet_sizes.length > 0 && (
          <div className="bg-white rounded-2xl border border-stone-200 p-5">
            <h3 className="text-sm font-bold text-stone-900 mb-3">Accepted Sizes</h3>
            <div className="flex flex-wrap gap-2">
              {profile.accepted_pet_sizes.map((size) => (
                <span key={size} className="bg-emerald-50 text-emerald-700 text-xs font-semibold px-3 py-1.5 rounded-full">
                  {SIZE_LABELS[size] || size}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Skills */}
        {profile.skills.length > 0 && (
          <div className="bg-white rounded-2xl border border-stone-200 p-5">
            <h3 className="text-sm font-bold text-stone-900 mb-3">Skills & Certifications</h3>
            <div className="flex flex-wrap gap-2">
              {profile.skills.map((skill) => (
                <span key={skill} className="bg-stone-100 text-stone-700 text-xs font-semibold px-3 py-1.5 rounded-full">
                  {formatSkill(skill)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Environment (dog-specific) */}
        {isDog && (
          <div className="bg-white rounded-2xl border border-stone-200 p-5">
            <h3 className="text-sm font-bold text-stone-900 mb-3">Home Environment</h3>
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
          </div>
        )}

        {/* Pet Preferences */}
        <div className="bg-white rounded-2xl border border-stone-200 p-5">
          <h3 className="text-sm font-bold text-stone-900 mb-3">Pet Preferences</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <EnvironmentItem label="Accepts puppies/kittens" value={profile.accepts_puppies} />
            <EnvironmentItem label="Accepts unspayed" value={profile.accepts_unspayed} />
            <EnvironmentItem label="Accepts unneutered" value={profile.accepts_unneutered} />
          </div>
        </div>

        {/* Own Pets */}
        {profile.owns_same_species && (
          <div className="bg-white rounded-2xl border border-stone-200 p-5">
            <h3 className="text-sm font-bold text-stone-900 mb-3">My {formatSpecies(profile.species)}s</h3>
            <p className="text-sm text-stone-600">{profile.own_pets_description || `Has own ${formatSpecies(profile.species).toLowerCase()}s`}</p>
          </div>
        )}

        {/* Services & Pricing */}
        {speciesServices.length > 0 && (
          <div className="bg-white rounded-2xl border border-stone-200 p-5">
            <h3 className="text-sm font-bold text-stone-900 mb-3">Services & Pricing</h3>
            <div className="space-y-2">
              {speciesServices.map((svc) => (
                <div key={svc.id} className="flex items-center justify-between p-3 bg-stone-50 rounded-xl">
                  <div className="flex items-center gap-2">
                    <span>{SERVICE_ICONS[svc.type] || '📋'}</span>
                    <span className="text-sm font-semibold text-stone-900">{getServiceLabel(svc.type, [profile.species])}</span>
                  </div>
                  <span className="text-sm font-bold text-emerald-600">
                    {svc.price_cents === 0 ? 'Free' : `$${(svc.price_cents / 100).toFixed(2)}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
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
