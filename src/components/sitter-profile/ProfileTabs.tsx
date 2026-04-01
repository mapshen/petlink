import { LayoutGrid, Star, Calendar } from 'lucide-react';
import { SPECIES_ICONS, formatSpecies } from '../../shared/species-utils';

export const FIXED_TABS = ['posts', 'reviews', 'availability'] as const;
export type FixedTabId = typeof FIXED_TABS[number];
export type TabId = FixedTabId | `species-${string}`;

const FIXED_TAB_CONFIG: Record<FixedTabId, { label: string; icon: typeof LayoutGrid }> = {
  posts: { label: 'Posts', icon: LayoutGrid },
  reviews: { label: 'Reviews', icon: Star },
  availability: { label: 'Availability', icon: Calendar },
};

interface Props {
  readonly activeTab: TabId;
  readonly onTabChange: (tab: TabId) => void;
  readonly speciesTabs?: string[];
}

export default function ProfileTabs({ activeTab, onTabChange, speciesTabs = [] }: Props) {
  return (
    <div className="bg-white border-t border-stone-200">
      <div className="max-w-[960px] mx-auto flex" role="tablist">
        {/* Species tabs */}
        {speciesTabs.map((species) => {
          const tabId: TabId = `species-${species}`;
          const isActive = activeTab === tabId;

          return (
            <button
              key={tabId}
              onClick={() => onTabChange(tabId)}
              aria-selected={isActive}
              role="tab"
              className={`flex-1 flex items-center justify-center gap-1.5 py-3.5 text-sm font-semibold border-b-2 transition-colors ${
                isActive
                  ? 'border-emerald-500 text-emerald-600'
                  : 'border-transparent text-stone-400 hover:text-stone-600'
              }`}
            >
              <span>{SPECIES_ICONS[species] || '🐾'}</span>
              {formatSpecies(species)}
            </button>
          );
        })}

        {/* Fixed tabs */}
        {FIXED_TABS.map((tab) => {
          const { label, icon: Icon } = FIXED_TAB_CONFIG[tab];
          const isActive = activeTab === tab;

          return (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
              aria-selected={isActive}
              role="tab"
              className={`flex-1 flex items-center justify-center gap-1.5 py-3.5 text-sm font-semibold border-b-2 transition-colors ${
                isActive
                  ? 'border-emerald-500 text-emerald-600'
                  : 'border-transparent text-stone-400 hover:text-stone-600'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
