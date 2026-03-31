import { Footprints, Home, Clock, Scissors, Users, Sun } from 'lucide-react';
import type { Service } from '../../types';

export const ALL_SERVICE_TYPES = ['walking', 'sitting', 'drop-in', 'daycare', 'grooming', 'meet_greet'] as const;

const SERVICE_ICONS: Record<string, typeof Footprints> = {
  walking: Footprints,
  sitting: Home,
  'drop-in': Clock,
  daycare: Sun,
  grooming: Scissors,
  meet_greet: Users,
};

const SERVICE_LABELS: Record<string, string> = {
  walking: 'Walking',
  sitting: 'Sitting',
  'drop-in': 'Drop-in',
  daycare: 'Daycare',
  grooming: 'Grooming',
  meet_greet: 'Meet & Greet',
};

export function getServiceLabel(type: string): string {
  return SERVICE_LABELS[type] || type.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

interface Props {
  readonly services: Service[];
  readonly onServiceClick?: (service: Service) => void;
}

export default function ServiceHighlights({ services, onServiceClick }: Props) {
  const activeTypes = new Set(services.map((s) => s.type));

  return (
    <div className="bg-white border-b border-stone-200 px-6 py-4">
      <div className="max-w-[960px] mx-auto flex gap-5 overflow-x-auto">
        {ALL_SERVICE_TYPES.map((type) => {
          const service = services.find((s) => s.type === type);
          const isActive = activeTypes.has(type);
          const Icon = SERVICE_ICONS[type] || Clock;

          const label = getServiceLabel(type);
          const priceText = service ? (service.price === 0 ? 'Free' : `$${service.price}`) : 'not offered';

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
                {getServiceLabel(type)}
              </span>
              <span className={`text-[11px] font-bold ${isActive ? 'text-emerald-600' : 'text-stone-400'}`}>
                {service ? (service.price === 0 ? 'Free' : `$${service.price}`) : '\u2014'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
