import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { X, ChevronDown, ChevronLeft, ChevronRight, DollarSign, SlidersHorizontal } from 'lucide-react';
import { getBadgesByCategory, type BadgeDefinition } from '../../shared/badge-catalog';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameMonth, isSameDay, isBefore, isAfter, startOfDay } from 'date-fns';

const PET_SPECIES = [
  { label: 'Dog', value: 'dog', emoji: '🐕' },
  { label: 'Cat', value: 'cat', emoji: '🐱' },
  { label: 'Bird', value: 'bird', emoji: '🐦' },
  { label: 'Reptile', value: 'reptile', emoji: '🦎' },
  { label: 'Small Animal', value: 'small_animal', emoji: '🐹' },
];

const PET_SIZES = [
  { label: 'Small', value: 'small', description: '0–25 lbs' },
  { label: 'Medium', value: 'medium', description: '26–50 lbs' },
  { label: 'Large', value: 'large', description: '51–100 lbs' },
  { label: 'Giant', value: 'giant', description: '100+ lbs' },
];

export interface SearchFiltersState {
  species: string;
  petSize: string;
  dateFrom: string;
  dateTo: string;
  minPrice: string;
  maxPrice: string;
  cancellationPolicy: string;
  responseTime: string;
  selectedBadges: string[];
}

interface Props {
  readonly filters: SearchFiltersState;
  readonly onFilterChange: <K extends keyof SearchFiltersState>(key: K, value: SearchFiltersState[K]) => void;
  readonly onClearAll: () => void;
}

// --- Click-outside hook ---
function useClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
  useEffect(() => {
    const listener = (e: MouseEvent) => {
      if (!ref.current || ref.current.contains(e.target as Node)) return;
      handler();
    };
    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, [ref, handler]);
}

// --- Pill Button ---
function FilterPill({
  label,
  active,
  hasDropdown,
  onClick,
}: {
  readonly label: string;
  readonly active: boolean;
  readonly hasDropdown?: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3.5 py-2 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
        active
          ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
          : 'border border-stone-200 text-stone-700 hover:border-stone-300 hover:bg-stone-50'
      }`}
    >
      {label}
      {active && !hasDropdown && (
        <span className="w-4 h-4 bg-emerald-600 text-white rounded-full text-[10px] flex items-center justify-center leading-none">✓</span>
      )}
      {hasDropdown && <ChevronDown className={`w-3 h-3 transition-transform ${active ? '' : ''}`} />}
    </button>
  );
}

// --- Popover Wrapper ---
function FilterPopover({
  children,
  open,
  onClose,
  className = '',
}: {
  readonly children: React.ReactNode;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, onClose);

  if (!open) return null;
  return (
    <div
      ref={ref}
      className={`absolute top-full left-0 mt-2 bg-white rounded-xl shadow-lg border border-stone-200 p-4 z-50 min-w-[220px] ${className}`}
    >
      {children}
    </div>
  );
}

// --- Pet Type Pills (inline toggles, no popover) ---
function PetTypePills({
  species,
  onChange,
}: {
  readonly species: string;
  readonly onChange: (v: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? PET_SPECIES : PET_SPECIES.slice(0, 3);

  return (
    <div className="flex items-center gap-1.5">
      {visible.map((s) => (
        <FilterPill
          key={s.value}
          label={`${s.emoji} ${s.label}`}
          active={species === s.value}
          onClick={() => onChange(species === s.value ? '' : s.value)}
        />
      ))}
      {!showAll && PET_SPECIES.length > 3 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="px-2.5 py-2 rounded-full text-sm text-stone-400 hover:text-stone-600 border border-stone-200 hover:border-stone-300"
        >
          +{PET_SPECIES.length - 3}
        </button>
      )}
    </div>
  );
}

// --- Dog Size Pill with Popover ---
function DogSizeFilter({
  petSize,
  onChange,
}: {
  readonly petSize: string;
  readonly onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedLabel = PET_SIZES.find((s) => s.value === petSize)?.label;

  return (
    <div className="relative">
      <FilterPill
        label={selectedLabel ? `Size: ${selectedLabel}` : 'Size'}
        active={!!petSize}
        hasDropdown
        onClick={() => setOpen(!open)}
      />
      <FilterPopover open={open} onClose={() => setOpen(false)}>
        <div className="space-y-1">
          {PET_SIZES.map((size) => (
            <button
              key={size.value}
              type="button"
              onClick={() => { onChange(petSize === size.value ? '' : size.value); setOpen(false); }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm flex justify-between items-center ${
                petSize === size.value
                  ? 'bg-emerald-50 text-emerald-700 font-medium'
                  : 'text-stone-700 hover:bg-stone-50'
              }`}
            >
              <span>{size.label}</span>
              <span className="text-xs text-stone-400">{size.description}</span>
            </button>
          ))}
        </div>
      </FilterPopover>
    </div>
  );
}

// --- Date Range Picker ---
const DAYS_OF_WEEK = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function DateRangeFilter({
  dateFrom,
  dateTo,
  onFromChange,
  onToChange,
}: {
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly onFromChange: (v: string) => void;
  readonly onToChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const today = useMemo(() => startOfDay(new Date()), []);

  const active = !!(dateFrom || dateTo);
  const label = active
    ? dateFrom && dateTo
      ? `${format(new Date(dateFrom), 'MMM d')} – ${format(new Date(dateTo), 'MMM d')}`
      : dateFrom
        ? `From ${format(new Date(dateFrom), 'MMM d')}`
        : `Until ${format(new Date(dateTo!), 'MMM d')}`
    : 'Dates';

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);

  const weeks: Date[][] = [];
  let day = calStart;
  while (isBefore(day, calEnd) || isSameDay(day, calEnd)) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(day);
      day = addDays(day, 1);
    }
    weeks.push(week);
  }

  const fromDate = dateFrom ? startOfDay(new Date(dateFrom)) : null;
  const toDate = dateTo ? startOfDay(new Date(dateTo)) : null;

  const handleDayClick = (d: Date) => {
    const iso = format(d, 'yyyy-MM-dd');
    if (!fromDate || (fromDate && toDate)) {
      // Start new selection
      onFromChange(iso);
      onToChange('');
    } else {
      // Complete the range
      if (isBefore(d, fromDate)) {
        onToChange(dateFrom);
        onFromChange(iso);
      } else {
        onToChange(iso);
      }
    }
  };

  const isInRange = (d: Date) => {
    if (!fromDate || !toDate) return false;
    return isAfter(d, fromDate) && isBefore(d, toDate);
  };

  const handleQuickSelect = (label: string) => {
    const t = startOfDay(new Date());
    if (label === 'this_week') {
      onFromChange(format(t, 'yyyy-MM-dd'));
      onToChange(format(addDays(t, 6), 'yyyy-MM-dd'));
    } else if (label === 'next_week') {
      const nextMon = addDays(t, 7 - t.getDay() + 1);
      onFromChange(format(nextMon, 'yyyy-MM-dd'));
      onToChange(format(addDays(nextMon, 6), 'yyyy-MM-dd'));
    } else if (label === 'next_30') {
      onFromChange(format(t, 'yyyy-MM-dd'));
      onToChange(format(addDays(t, 29), 'yyyy-MM-dd'));
    }
  };

  return (
    <div className="relative">
      <FilterPill label={label} active={active} hasDropdown onClick={() => setOpen(!open)} />
      <FilterPopover open={open} onClose={() => setOpen(false)} className="w-[300px] p-3">
        {/* Quick selects */}
        <div className="flex gap-1.5 mb-3">
          {[
            { label: 'This week', value: 'this_week' },
            { label: 'Next week', value: 'next_week' },
            { label: 'Next 30 days', value: 'next_30' },
          ].map((q) => (
            <button
              key={q.value}
              type="button"
              onClick={() => handleQuickSelect(q.value)}
              className="px-2.5 py-1 rounded-md text-xs font-medium text-stone-600 bg-stone-100 hover:bg-stone-200 transition-colors"
            >
              {q.label}
            </button>
          ))}
        </div>

        {/* Month navigation */}
        <div className="flex items-center justify-between mb-2">
          <button
            type="button"
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="p-1 rounded-md hover:bg-stone-100 text-stone-500"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-semibold text-stone-800">
            {format(currentMonth, 'MMMM yyyy')}
          </span>
          <button
            type="button"
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="p-1 rounded-md hover:bg-stone-100 text-stone-500"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1">
          {DAYS_OF_WEEK.map((d) => (
            <div key={d} className="text-center text-[10px] font-semibold text-stone-400 uppercase py-1">
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-7">
          {weeks.flatMap((week) =>
            week.map((d) => {
              const inMonth = isSameMonth(d, currentMonth);
              const isPast = isBefore(d, today);
              const isStart = fromDate ? isSameDay(d, fromDate) : false;
              const isEnd = toDate ? isSameDay(d, toDate) : false;
              const inRange = isInRange(d);
              const disabled = isPast || !inMonth;

              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleDayClick(d)}
                  className={`
                    h-8 text-xs rounded-md transition-colors relative
                    ${disabled ? 'text-stone-300 cursor-default' : 'hover:bg-emerald-50 cursor-pointer'}
                    ${isStart || isEnd ? 'bg-emerald-600 text-white font-semibold hover:bg-emerald-700' : ''}
                    ${inRange ? 'bg-emerald-100 text-emerald-800' : ''}
                    ${!isStart && !isEnd && !inRange && inMonth ? 'text-stone-700' : ''}
                  `}
                >
                  {d.getDate()}
                </button>
              );
            })
          )}
        </div>

        {/* Clear dates */}
        {active && (
          <button
            type="button"
            onClick={() => { onFromChange(''); onToChange(''); }}
            className="mt-2 text-xs text-stone-400 hover:text-stone-600 w-full text-center"
          >
            Clear dates
          </button>
        )}
      </FilterPopover>
    </div>
  );
}

// --- Price Pill with Popover ---
function PriceFilter({
  minPrice,
  maxPrice,
  onMinChange,
  onMaxChange,
}: {
  readonly minPrice: string;
  readonly maxPrice: string;
  readonly onMinChange: (v: string) => void;
  readonly onMaxChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = !!(minPrice || maxPrice);
  const label = active
    ? minPrice && maxPrice ? `$${minPrice}–$${maxPrice}`
    : minPrice ? `$${minPrice}+`
    : `Up to $${maxPrice}`
    : 'Price';

  return (
    <div className="relative">
      <FilterPill label={label} active={active} hasDropdown onClick={() => setOpen(!open)} />
      <FilterPopover open={open} onClose={() => setOpen(false)}>
        <label className="block text-xs font-medium text-stone-500 mb-2">
          <DollarSign className="w-3 h-3 inline mr-0.5" />
          Price range
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            placeholder="Min"
            value={minPrice}
            onChange={(e) => onMinChange(e.target.value)}
            className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
          <span className="text-stone-300 text-xs">—</span>
          <input
            type="number"
            min="0"
            placeholder="Max"
            value={maxPrice}
            onChange={(e) => onMaxChange(e.target.value)}
            className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>
      </FilterPopover>
    </div>
  );
}

// --- Cancellation Pill with Popover ---
function CancellationFilter({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const policies = [
    { value: 'flexible', label: 'Flexible', desc: 'Full refund 24h before' },
    { value: 'moderate', label: 'Moderate', desc: '50% refund 48h before' },
    { value: 'strict', label: 'Strict', desc: 'No refund within 7 days' },
  ];

  return (
    <div className="relative">
      <FilterPill
        label={value ? `${value.charAt(0).toUpperCase() + value.slice(1)} cancellation` : 'Cancellation'}
        active={!!value}
        hasDropdown
        onClick={() => setOpen(!open)}
      />
      <FilterPopover open={open} onClose={() => setOpen(false)}>
        <div className="space-y-1">
          {policies.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => { onChange(value === p.value ? '' : p.value); setOpen(false); }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm ${
                value === p.value
                  ? 'bg-emerald-50 text-emerald-700 font-medium'
                  : 'text-stone-700 hover:bg-stone-50'
              }`}
            >
              <div>{p.label}</div>
              <div className="text-[10px] text-stone-400">{p.desc}</div>
            </button>
          ))}
        </div>
      </FilterPopover>
    </div>
  );
}

// --- Response Time Pill with Popover ---
function ResponseTimeFilter({
  value,
  onChange,
}: {
  readonly value: string;
  readonly onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const options = [
    { value: '1', label: 'Under 1 hour' },
    { value: '4', label: 'Under 4 hours' },
  ];

  return (
    <div className="relative">
      <FilterPill
        label={value === '1' ? '< 1hr response' : value === '4' ? '< 4hr response' : 'Response time'}
        active={!!value}
        hasDropdown
        onClick={() => setOpen(!open)}
      />
      <FilterPopover open={open} onClose={() => setOpen(false)}>
        <div className="space-y-1">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(value === opt.value ? '' : opt.value); setOpen(false); }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm ${
                value === opt.value
                  ? 'bg-emerald-50 text-emerald-700 font-medium'
                  : 'text-stone-700 hover:bg-stone-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </FilterPopover>
    </div>
  );
}

// --- Badges "More" Pill with Grouped Popover ---
function BadgesFilter({
  selected,
  onChange,
}: {
  readonly selected: string[];
  readonly onChange: (badges: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const groups = useMemo(() => getBadgesByCategory(), []);

  const toggle = useCallback((slug: string) => {
    onChange(
      selected.includes(slug)
        ? selected.filter((b) => b !== slug)
        : [...selected, slug]
    );
  }, [selected, onChange]);

  return (
    <div className="relative">
      <FilterPill
        label={selected.length > 0 ? `More (${selected.length})` : 'More'}
        active={selected.length > 0}
        hasDropdown
        onClick={() => setOpen(!open)}
      />
      <FilterPopover open={open} onClose={() => setOpen(false)} className="w-[280px]">
        <div className="flex items-center gap-1.5 mb-3">
          <SlidersHorizontal className="w-3.5 h-3.5 text-stone-400" />
          <span className="text-xs font-semibold text-stone-600">Sitter qualities</span>
        </div>
        <div className="space-y-4 max-h-72 overflow-y-auto">
          {groups.map((group) => (
            <div key={group.category}>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-stone-400 mb-1.5 px-2">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.badges.map((badge: BadgeDefinition) => (
                  <label key={badge.slug} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-stone-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.includes(badge.slug)}
                      onChange={() => toggle(badge.slug)}
                      className="rounded border-stone-300 text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5"
                    />
                    <span className={`text-sm ${selected.includes(badge.slug) ? 'text-stone-900 font-medium' : 'text-stone-600'}`}>
                      {badge.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="mt-3 text-xs text-stone-400 hover:text-stone-600 w-full text-center"
          >
            Clear badges
          </button>
        )}
      </FilterPopover>
    </div>
  );
}

// --- Main Component ---
export default function SearchFilters({ filters, onFilterChange, onClearAll }: Props) {
  const { species, petSize, dateFrom, dateTo, minPrice, maxPrice, cancellationPolicy, responseTime, selectedBadges } = filters;
  const hasActive = !!(species || petSize || dateFrom || dateTo || minPrice || maxPrice || cancellationPolicy || responseTime || selectedBadges.length > 0);

  return (
    <div className="flex items-center gap-2 flex-wrap mb-6">
      {/* 1. Pet type */}
      <PetTypePills species={species} onChange={(v) => onFilterChange('species', v)} />

      {/* 2. Dog size (conditional) */}
      {(!species || species === 'dog') && (
        <>
          <div className="h-5 w-px bg-stone-200" />
          <DogSizeFilter petSize={petSize} onChange={(v) => onFilterChange('petSize', v)} />
        </>
      )}

      <div className="h-5 w-px bg-stone-200" />

      {/* 3. Dates */}
      <DateRangeFilter
        dateFrom={dateFrom}
        dateTo={dateTo}
        onFromChange={(v) => onFilterChange('dateFrom', v)}
        onToChange={(v) => onFilterChange('dateTo', v)}
      />

      {/* 4. Price */}
      <PriceFilter
        minPrice={minPrice}
        maxPrice={maxPrice}
        onMinChange={(v) => onFilterChange('minPrice', v)}
        onMaxChange={(v) => onFilterChange('maxPrice', v)}
      />

      {/* 5. Cancellation */}
      <CancellationFilter value={cancellationPolicy} onChange={(v) => onFilterChange('cancellationPolicy', v)} />

      {/* 6. Response time */}
      <ResponseTimeFilter value={responseTime} onChange={(v) => onFilterChange('responseTime', v)} />

      {/* 7. More (badges, grouped) */}
      <BadgesFilter selected={selectedBadges} onChange={(v) => onFilterChange('selectedBadges', v)} />

      {/* Clear all */}
      {hasActive && (
        <button
          type="button"
          onClick={onClearAll}
          className="text-stone-400 text-sm hover:text-stone-600 flex items-center gap-1 ml-1"
        >
          <X className="w-3 h-3" />
          Clear
        </button>
      )}
    </div>
  );
}
