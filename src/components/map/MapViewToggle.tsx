import React from 'react';
import { List, Map, Columns2 } from 'lucide-react';
import type { MapView } from '../../hooks/useMapViewPreference';

interface MapViewToggleProps {
  readonly view: MapView;
  readonly onViewChange: (v: MapView) => void;
  readonly showSplitOption?: boolean;
}

const VIEW_OPTIONS: { value: MapView; icon: typeof List; label: string; splitOnly?: boolean }[] = [
  { value: 'list', icon: List, label: 'List' },
  { value: 'map', icon: Map, label: 'Map' },
  { value: 'split', icon: Columns2, label: 'Split', splitOnly: true },
];

export default function MapViewToggle({ view, onViewChange, showSplitOption = false }: MapViewToggleProps) {
  return (
    <div className="flex items-center gap-1 bg-stone-100 rounded-xl p-1">
      {VIEW_OPTIONS.map((opt) => {
        if (opt.splitOnly && !showSplitOption) return null;
        const Icon = opt.icon;
        const isActive = view === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onViewChange(opt.value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              isActive
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-stone-600 hover:bg-stone-200'
            }`}
            aria-label={`${opt.label} view`}
            aria-pressed={isActive}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
