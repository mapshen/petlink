import React, { useEffect, useState } from 'react';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import type { SitterAddon } from '../../types';
import { Plus, Trash2, Save, X } from 'lucide-react';
import { API_BASE } from '../../config';
import { Button } from '../../components/ui/button';
import { Alert, AlertDescription } from '../../components/ui/alert';
import { Input } from '../../components/ui/input';
import { formatCents } from '../../lib/money';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';
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
  const [deleteDialogId, setDeleteDialogId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

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

  const enableAddon = async (def: AddonDefinition) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/addons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders(token) },
        body: JSON.stringify({ addon_slug: def.slug, price_cents: def.defaultPriceCents, notes: null }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to enable add-on');
      }
      await fetchAddons();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enable add-on');
    } finally {
      setSaving(false);
    }
  };

  const startEditing = (addon: SitterAddon) => {
    setEditingSlug(addon.addon_slug);
    setEditPrice((addon.price_cents / 100).toFixed(2));
    setEditNotes(addon.notes || '');
  };

  const saveEdit = async (addon: SitterAddon) => {
    const priceCents = Math.round(parseFloat(editPrice) * 100);
    if (isNaN(priceCents) || priceCents < 0) {
      setError('Invalid price');
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
      if (!res.ok) throw new Error('Failed to update add-on');
      setEditingSlug(null);
      await fetchAddons();
    } catch {
      setError('Failed to update add-on');
    } finally {
      setSaving(false);
    }
  };

  const deleteAddon = async (id: number) => {
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/addons/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(token),
      });
      if (!res.ok) throw new Error('Failed to remove add-on');
      await fetchAddons();
    } catch {
      setError('Failed to remove add-on');
    } finally {
      setDeletingId(null);
      setDeleteDialogId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  const categories = getAddonsByCategory().map((group) => ({
    ...group,
    addons: group.addons.filter((a) => availableCatalog.some((ac) => ac.slug === a.slug)),
  })).filter((g) => g.addons.length > 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-stone-900">Add-on Services</h2>
          <p className="text-sm text-stone-500">Enable extras to stand out in search results</p>
        </div>
        <span className="text-xs text-stone-400">{addons.length} enabled</span>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-6">
        {categories.map((group) => (
          <div key={group.category}>
            <h3 className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-3">{group.label}</h3>
            <div className="space-y-2">
              {group.addons.map((def) => {
                const enabled = enabledSlugs.has(def.slug);
                const addon = addons.find((a) => a.addon_slug === def.slug);
                const isEditing = editingSlug === def.slug;

                return (
                  <div
                    key={def.slug}
                    className={`rounded-xl p-4 transition-colors ${
                      enabled
                        ? 'border border-emerald-200 bg-emerald-50/30'
                        : 'border border-stone-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="text-lg flex-shrink-0">{def.emoji}</span>
                        <div className="min-w-0">
                          <div className="font-medium text-stone-900 text-sm">{def.label}</div>
                          <div className="text-xs text-stone-500 mt-0.5">{def.description}</div>
                        </div>
                      </div>

                      {enabled ? (
                        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                          {!isEditing && (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => addon && startEditing(addon)}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-red-400 hover:text-red-600"
                                onClick={() => addon && setDeleteDialogId(addon.id)}
                                disabled={deletingId === addon?.id}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs flex-shrink-0 ml-2"
                          onClick={() => enableAddon(def)}
                          disabled={saving}
                        >
                          <Plus className="w-3 h-3 mr-1" />
                          Enable
                        </Button>
                      )}
                    </div>

                    {enabled && addon && !isEditing && (
                      <div className="mt-2 ml-8 flex items-center gap-3 text-xs text-stone-500">
                        <span className="font-medium text-emerald-700">
                          {addon.price_cents === 0 ? 'Free' : `${formatCents(addon.price_cents)} / ${def.pricingUnit}`}
                        </span>
                        {addon.notes && (
                          <span className="text-stone-400 truncate">{addon.notes}</span>
                        )}
                      </div>
                    )}

                    {enabled && addon && isEditing && (
                      <div className="mt-3 ml-8 space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1">
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
                        </div>
                        <Input
                          placeholder="Optional note (shown to owners)..."
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          maxLength={500}
                          className="h-7 text-xs"
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => saveEdit(addon)}
                            disabled={saving}
                          >
                            <Save className="w-3 h-3 mr-1" />
                            Save
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setEditingSlug(null)}
                          >
                            <X className="w-3 h-3 mr-1" />
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <AlertDialog open={deleteDialogId !== null} onOpenChange={() => setDeleteDialogId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove add-on?</AlertDialogTitle>
            <AlertDialogDescription>
              This add-on will no longer appear on your profile or be available for new bookings.
              Existing bookings with this add-on are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteDialogId && deleteAddon(deleteDialogId)}
              className="bg-red-600 hover:bg-red-700"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
