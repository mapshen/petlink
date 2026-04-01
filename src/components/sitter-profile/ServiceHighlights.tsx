import { Footprints, Home, Clock, Scissors, Users, Sun } from 'lucide-react';
import type { Service } from '../../types';
import { getServiceLabel } from '../../shared/service-labels';

export const ALL_SERVICE_TYPES = ['meet_greet', 'walking', 'sitting', 'drop-in', 'daycare', 'grooming'] as const;

const SERVICE_ICONS: Record<string, typeof Footprints> = {
  walking: Footprints,
  sitting: Home,
  'drop-in': Clock,
  daycare: Sun,
  grooming: Scissors,
  meet_greet: Users,
};

interface Props {
  readonly services: Service[];
  readonly onServiceClick?: (service: Service) => void;
  readonly selectedSpecies?: string | null;
}

export default function ServiceHighlights({ services, onServiceClick, selectedSpecies }: Props) {
  const filteredServices = selectedSpecies
    ? services.filter((s) => s.species === selectedSpecies)
    : services;
  const activeTypes = new Set(filteredServices.map((s) => s.type));

  return (
    <div className="bg-white border-b border-stone-200 px-6 py-4">
      <div className="max-w-[960px] mx-auto flex gap-5 overflow-x-auto">
        {ALL_SERVICE_TYPES.map((type) => {
          const service = filteredServices.find((s) => s.type === type);
          const isActive = activeTypes.has(type);
          const Icon = SERVICE_ICONS[type] || Clock;

          const speciesArr = selectedSpecies ? [selectedSpecies] : undefined;
          const label = getServiceLabel(type, speciesArr);
          const priceText = service ? (service.price_cents === 0 ? 'Free' : `$${(service.price_cents / 100).toFixed(2)}`) : 'not offered';

          return (
            <button
              key={type}
              onClick={() => service && onServiceClick?.(service)}
              disabled={!isActive}
              aria-label={`${label}: ${priceText}`}
              className="flex flex-col items-center gap-1 flex-shrink-0"
            >
              <div
                className={`w-16 h-16 rounded-full p-0.5 ${
                  isActive ? 'border-2 border-emerald-500' : 'border-2 border-dashed border-stone-300'
                }`}
              >
                <div
                  className={`w-full h-full rounded-full flex items-center justify-center ${
                    isActive ? 'bg-emerald-50' : 'bg-stone-50'
                  }`}
                >
                  <Icon className={`w-6 h-6 ${isActive ? 'text-emerald-600' : 'text-stone-400'}`} />
                </div>
              </div>
              <span className={`text-[11px] font-semibold ${isActive ? 'text-stone-900' : 'text-stone-400'}`}>
                {label}
              </span>
              <span className={`text-[11px] font-bold ${isActive ? 'text-emerald-600' : 'text-stone-400'}`}>
                {service ? (service.price_cents === 0 ? 'Free' : `$${(service.price_cents / 100).toFixed(2)}`) : '\u2014'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
