import { useEffect, useState } from 'react';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import type { SitterAddon } from '../../types';
import { Save, X, PackagePlus } from 'lucide-react';
import { API_BASE } from '../../config';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Input } from '../../components/ui/input';
import { formatCents } from '../../lib/money';
import { EmptyState } from '../../components/ui/EmptyState';
import { getAddonsByCategory, getAddonsForSpecies, type AddonDefinition } from '../../shared/addon-catalog';

export default function AddonsTab() {
  const { user, token } = useAuth();
  const [addons, setAddons] = useState<SitterAddon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState('');
  const [editNotes, setEditNotes] = useState('');

  const acceptedSpecies = user?.accepted_species || [];
  const availableCatalog = getAddonsForSpecies(acceptedSpecies);
  const enabledSlugs = new Set(addons.map((a) => a.addon_slug));

  useEffect(() => {
    if (!user) return;
    fetchAddons();
  }, [user]);

  const fetchAddons = async () => {
    try {
      const res = await fetch(`${API_BASE}/addons/me`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error('Failed to load add-ons');
      const data = await res.json();
      setAddons(data.addons);
    } catch {
      setError('Failed to load add-ons');
    } finally {
      setLoading(false);
    }
  };

  const toggleAddon = async (def: AddonDefinition) => {
    const existing = addons.find((a) => a.addon_slug === def.slug);
    setSaving(true);
    setError(null);
    try {
      if (existing) {
        const res = await fetch(`${API_BASE}/addons/${existing.id}`, {
          method: 'DELETE',
          headers: getAuthHeaders(token),
        });
        if (!res.ok) throw new Error('Failed to remove add-on');
      } else {
        const res = await fetch(`${API_BASE}/addons`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders(token) },
          body: JSON.stringify({ addon_slug: def.slug, price_cents: def.defaultPriceCents, notes: null }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to enable add-on');
        }
      }
      await fetchAddons();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update add-on');
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (addon: SitterAddon) => { setEditingSlug(addon.addon_slug); setEditPrice((addon.price_cents / 100).toFixed(2)); setEditNotes(addon.notes || ''); };

  const saveEdit = async (addon: SitterAddon) => {
    const priceCents = Math.round(parseFloat(editPrice) * 100);
    if (isNaN(priceCents) || priceCents < 0 || priceCents > 50000) {
      setError('Price must be between $0 and $500');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/addons/${addon.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders(token) },
        body: JSON.stringify({ price_cents: priceCents, notes: editNotes || null }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update add-on');
      }
      setEditingSlug(null);
      await fetchAddons();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update add-on');
    } finally {
      setSaving(false);
    }
  };

  // Flat list sorted by category (no grouping headers)
  const flatAddons = getAddonsByCategory()
    .flatMap((group) => group.addons)
    .filter((a) => availableCatalog.some((ac) => ac.slug === a.slug));

  if (loading) return <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" /></div>;
  if (flatAddons.length === 0) return <EmptyState icon={PackagePlus} title="No add-ons available" description="Set up services for a species first" />;

  return (
    <div>
      <p className="text-xs text-stone-400 text-right mb-4">{addons.length} enabled</p>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="border border-stone-200 rounded-xl divide-y divide-stone-200">
        {flatAddons.map((def) => {
          const enabled = enabledSlugs.has(def.slug);
          const addon = addons.find((a) => a.addon_slug === def.slug);
          const isEditing = editingSlug === def.slug;

          return (
            <div key={def.slug} className="px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-base flex-shrink-0">{def.emoji}</span>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => enabled && addon && !isEditing ? startEditing(addon) : undefined} tabIndex={enabled && !isEditing ? 0 : -1}>
                  <span className="text-sm font-medium text-stone-900 hover:text-emerald-700 block">{def.label}</span>
                  <span className="text-xs text-stone-400 leading-snug block">{def.description}</span>
                </button>
                <div className="flex items-center gap-3 flex-shrink-0">
                  {enabled && addon && !isEditing && (
                    <span className="text-xs font-medium text-emerald-700">
                      {addon.price_cents === 0 ? 'Free' : formatCents(addon.price_cents)}
                    </span>
                  )}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    aria-label={`Toggle ${def.label}`}
                    onClick={() => toggleAddon(def)}
                    disabled={saving}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${enabled ? 'bg-emerald-500' : 'bg-stone-300'}`}
                  >
                    <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              </div>

              {enabled && addon && isEditing && (
                <div className="mt-3 ml-7 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-stone-500">$</span>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="500"
                      value={editPrice}
                      onChange={(e) => setEditPrice(e.target.value)}
                      className="w-24 h-7 text-sm text-right"
                    />
                    <span className="text-xs text-stone-400 whitespace-nowrap">/ {def.pricingUnit}</span>
                  </div>
                  <Input
                    placeholder="Optional note (shown to owners)..."
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    maxLength={500}
                    className="h-7 text-xs"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => saveEdit(addon)}
                      disabled={saving}
                      className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
                    >
                      <Save className="w-3 h-3" /> Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingSlug(null)}
                      className="inline-flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600"
                    >
                      <X className="w-3 h-3" /> Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
