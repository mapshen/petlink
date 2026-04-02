import { useState, useEffect, useRef } from 'react';
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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced Nominatim search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=us&q=${encodeURIComponent(value)}`,
          { headers: { 'User-Agent': 'PetLink/1.0' } }
        );
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data);
          setOpen(data.length > 0);
        }
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
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

  const handleSelect = (suggestion: Suggestion) => {
    const parts = suggestion.display_name.split(', ');
    const shortLabel = parts.length >= 3 ? `${parts[0]}, ${parts[1]}, ${parts[2]}` : suggestion.display_name;
    onChange(shortLabel);
    onSelect(parseFloat(suggestion.lat), parseFloat(suggestion.lon), shortLabel);
    setOpen(false);
    setSuggestions([]);
  };

  const handleClear = () => {
    onChange('');
    setSuggestions([]);
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative flex-grow">
      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
      <input
        type="text"
        placeholder={placeholder || 'Enter address, city, or zip code'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => { if (suggestions.length > 0) setOpen(true); }}
        className="w-full pl-10 pr-10 py-2.5 border border-stone-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm"
      />
      {loading && (
        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 animate-spin" />
      )}
      {!loading && value && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      {open && suggestions.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-white border border-stone-200 rounded-xl shadow-lg overflow-hidden">
          {suggestions.map((s, i) => {
            const parts = s.display_name.split(', ');
            const primary = parts[0];
            const secondary = parts.slice(1, 3).join(', ');
            return (
              <button
                key={`${s.lat}-${s.lon}-${i}`}
                type="button"
                onClick={() => handleSelect(s)}
                className="w-full text-left px-4 py-2.5 hover:bg-emerald-50 transition-colors border-b border-stone-50 last:border-0"
              >
                <div className="text-sm font-medium text-stone-900">{primary}</div>
                {secondary && <div className="text-xs text-stone-500">{secondary}</div>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
