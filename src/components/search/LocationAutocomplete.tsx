import { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, Loader2, X } from 'lucide-react';

interface Suggestion {
  display_name: string;
  lat: string;
  lon: string;
}

interface Props {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSelect: (lat: number, lng: number, label: string) => void;
  readonly placeholder?: string;
}

export default function LocationAutocomplete({ value, onChange, onSelect, placeholder }: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced Nominatim search with AbortController
  useEffect(() => {
    if (value.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      // Cancel any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=us&q=${encodeURIComponent(value)}`,
          { signal: controller.signal }
        );
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data);
          setOpen(data.length > 0);
          setActiveIndex(-1);
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setSuggestions([]);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 500);

    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [value]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = useCallback((suggestion: Suggestion) => {
    const lat = parseFloat(suggestion.lat);
    const lng = parseFloat(suggestion.lon);
    if (isNaN(lat) || isNaN(lng)) return;

    const parts = suggestion.display_name.split(', ');
    const shortLabel = parts.length >= 3 ? `${parts[0]}, ${parts[1]}, ${parts[2]}` : suggestion.display_name;
    onChange(shortLabel);
    onSelect(lat, lng, shortLabel);
    setOpen(false);
    setSuggestions([]);
  }, [onChange, onSelect]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[activeIndex]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative flex-grow" role="combobox" aria-expanded={open} aria-haspopup="listbox">
      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
      <input
        type="text"
        placeholder={placeholder || 'Enter address, city, or zip code'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
        onKeyDown={handleKeyDown}
        aria-label={placeholder || 'Enter address, city, or zip code'}
        aria-autocomplete="list"
        aria-activedescendant={activeIndex >= 0 ? `location-option-${activeIndex}` : undefined}
        className="w-full pl-10 pr-10 py-2.5 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
      />
      {loading && (
        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 animate-spin" />
      )}
      {!loading && value && (
        <button
          type="button"
          onClick={() => { onChange(''); setSuggestions([]); setOpen(false); }}
          aria-label="Clear location"
          className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      {open && suggestions.length > 0 && (
        <ul role="listbox" className="absolute z-50 top-full mt-1 w-full bg-white border border-stone-200 rounded-xl shadow-lg overflow-hidden">
          {suggestions.map((s, i) => {
            const parts = s.display_name.split(', ');
            const primary = parts[0];
            const secondary = parts.slice(1, 3).join(', ');
            return (
              <li
                key={`${s.lat}-${s.lon}-${i}`}
                id={`location-option-${i}`}
                role="option"
                aria-selected={i === activeIndex}
                onClick={() => handleSelect(s)}
                className={`cursor-pointer px-4 py-2.5 transition-colors border-b border-stone-50 last:border-0 ${
                  i === activeIndex ? 'bg-emerald-50' : 'hover:bg-emerald-50'
                }`}
              >
                <div className="text-sm font-medium text-stone-900">{primary}</div>
                {secondary && <div className="text-xs text-stone-500">{secondary}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
