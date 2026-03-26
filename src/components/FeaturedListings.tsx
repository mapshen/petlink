import React, { useState, useEffect } from 'react';
import { useAuth, getAuthHeaders } from '../context/AuthContext';
import { Megaphone, Plus, Pause, Play, Trash2, X, Save } from 'lucide-react';
import { API_BASE } from '../config';
import { FeaturedListing } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';

const SERVICE_LABELS: Record<string, string> = {
  walking: 'Dog Walking',
  sitting: 'House Sitting',
  'drop-in': 'Drop-in Visit',
  grooming: 'Grooming',
  meet_greet: 'Meet & Greet',
};

export default function FeaturedListings() {
  const { token } = useAuth();
  const [listings, setListings] = useState<FeaturedListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [serviceType, setServiceType] = useState('walking');
  const [dailyBudget, setDailyBudget] = useState('5');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchListings(); }, []);

  const fetchListings = async () => {
    try {
      const res = await fetch(`${API_BASE}/featured-listings/me`, { headers: getAuthHeaders(token) });
      if (res.ok) {
        const data = await res.json();
        setListings(data.listings);
      }
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/featured-listings`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          service_type: serviceType,
          daily_budget_cents: Math.round(Number(dailyBudget) * 100),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create listing');
      }
      setShowForm(false);
      setDailyBudget('5');
      fetchListings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (listing: FeaturedListing) => {
    const action = listing.active ? 'pause' : 'resume';
    try {
      await fetch(`${API_BASE}/featured-listings/${listing.id}/${action}`, {
        method: 'PUT',
        headers: getAuthHeaders(token),
      });
      fetchListings();
    } catch {
      // Silently fail
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await fetch(`${API_BASE}/featured-listings/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(token),
      });
      fetchListings();
    } catch {
      // Silently fail
    }
  };

  if (loading) return null;

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-emerald-600" />
          <h2 className="text-lg font-bold text-stone-900">Featured Listings</h2>
        </div>
        {!showForm && (
          <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4" /> Promote
          </Button>
        )}
      </div>

      <p className="text-sm text-stone-500 mb-4">Boost your services to appear at the top of search results.</p>

      {showForm && (
        <div className="bg-stone-50 rounded-xl border border-stone-200 p-5 mb-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-stone-900">New Campaign</h3>
            <button onClick={() => { setShowForm(false); setError(null); }} className="text-stone-400 hover:text-stone-600"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Service</label>
              <select value={serviceType} onChange={e => setServiceType(e.target.value)}
                className="w-full p-2.5 border border-stone-200 rounded-lg text-sm">
                {Object.entries(SERVICE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Daily budget ($)</label>
              <Input type="number" min="1" max="1000" step="1" value={dailyBudget}
                onChange={e => setDailyBudget(e.target.value)} />
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCreate} disabled={saving || !dailyBudget}>
              <Save className="w-3.5 h-3.5" /> {saving ? 'Creating...' : 'Start Campaign'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setShowForm(false); setError(null); }}>Cancel</Button>
          </div>
        </div>
      )}

      {listings.length === 0 && !showForm && (
        <div className="text-center py-8 bg-stone-50 rounded-xl border border-stone-200">
          <Megaphone className="w-8 h-8 mx-auto mb-3 text-stone-300" />
          <p className="text-sm text-stone-500">No active campaigns. Promote a service to get more bookings.</p>
        </div>
      )}

      {listings.length > 0 && (
        <div className="space-y-3">
          {listings.map(listing => (
            <div key={listing.id} className={`rounded-xl border p-4 flex items-center justify-between ${listing.active ? 'bg-white border-emerald-200' : 'bg-stone-50 border-stone-200 opacity-60'}`}>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-stone-900">
                    {listing.service_type ? SERVICE_LABELS[listing.service_type] || listing.service_type : 'All Services'}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${listing.active ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-200 text-stone-500'}`}>
                    {listing.active ? 'Active' : 'Paused'}
                  </span>
                </div>
                <div className="text-xs text-stone-400 mt-1">
                  ${(listing.daily_budget_cents / 100).toFixed(2)}/day &middot; ${(listing.spent_cents / 100).toFixed(2)} spent
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => toggleActive(listing)}
                  className="p-2 text-stone-400 hover:text-emerald-600 rounded-lg hover:bg-emerald-50 transition-colors"
                  title={listing.active ? 'Pause' : 'Resume'}>
                  {listing.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <button onClick={() => handleDelete(listing.id)}
                  className="p-2 text-stone-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                  title="Delete">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
