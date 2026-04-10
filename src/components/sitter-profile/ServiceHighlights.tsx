import { Plus } from 'lucide-react';
import { getServiceLabel } from '../../shared/service-labels';
import { SPECIES_ICONS } from '../../shared/species-utils';
import { formatCents } from '../../lib/money';
import type { Service } from '../../types';

const SERVICE_EMOJI: Record<string, string> = {
  walking: '🚶',
  sitting: '🏠',
  boarding: '🛏️',
  daycare: '🐾',
  'drop-in': '👋',
  grooming: '✂️',
  meet_greet: '🤝',
};

export function getHighlightServices(services: Service[], selectedSpecies: string | null): Service[] {
  return services.filter(s => {
    if (s.type === 'meet_greet') return false;
    if (selectedSpecies) return s.species === selectedSpecies;
    return true;
  });
}

interface Props {
  readonly services: Service[];
  readonly selectedSpecies: string | null;
  readonly onServiceClick: (service: Service) => void;
  readonly showAddButton?: boolean;
  readonly onAddClick?: () => void;
}

export default function ServiceHighlights({
  services,
  selectedSpecies,
  onServiceClick,
  showAddButton = false,
  onAddClick,
}: Props) {
  const highlights = getHighlightServices(services, selectedSpecies);

  if (highlights.length === 0 && !showAddButton) return null;

  return (
    <div className="flex gap-4 overflow-x-auto pb-1">
      {highlights.map(service => (
        <button
          key={service.id}
          onClick={() => onServiceClick(service)}
          className="flex flex-col items-center gap-1 flex-shrink-0 cursor-pointer group"
        >
          <div className="w-16 h-16 rounded-full border-2 border-emerald-500 p-0.5 relative">
            <div className="w-full h-full rounded-full bg-emerald-50 flex items-center justify-center text-xl group-hover:bg-emerald-100 transition-colors">
              {SERVICE_EMOJI[service.type] || '🐾'}
            </div>
            {!selectedSpecies && service.species && (
              <span className="absolute -bottom-0.5 -right-0.5 text-xs bg-white rounded-full border border-stone-200 w-5 h-5 flex items-center justify-center">
                {SPECIES_ICONS[service.species] || '🐾'}
              </span>
            )}
          </div>
          <span className="text-[10px] font-semibold text-stone-700">
            {getServiceLabel(service.type)}
          </span>
          <span className="text-[10px] text-emerald-600 font-medium">
            {service.price_cents === 0 ? 'Free' : formatCents(service.price_cents)}
          </span>
        </button>
      ))}
      {showAddButton && (
        <button
          onClick={onAddClick}
          className="flex flex-col items-center gap-1 flex-shrink-0 cursor-pointer"
        >
          <div className="w-16 h-16 rounded-full border-2 border-dashed border-stone-300 flex items-center justify-center text-stone-400 hover:border-emerald-400 hover:text-emerald-500 transition-colors">
            <Plus className="w-5 h-5" />
          </div>
          <span className="text-[10px] text-stone-400">Add</span>
        </button>
      )}
    </div>
  );
}
