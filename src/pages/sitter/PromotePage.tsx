import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { Megaphone, Plus, Pause, Play, Trash2, X, Save, TrendingUp, Eye, MousePointer, Calendar, AlertCircle } from 'lucide-react';
import { API_BASE } from '../../config';
import { FeaturedListing } from '../../types';
import { Button } from '../../components/ui/button';
import { Alert, AlertDescription } from '../../components/ui/alert';
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

const SERVICE_LABELS: Record<string, string> = {
  walking: 'Pet Walking',
  sitting: 'House Sitting',
  'drop-in': 'Drop-in Visit',
  daycare: 'Daycare',
  grooming: 'Grooming',
  meet_greet: 'Meet & Greet',
};

function formatCurrency(cents: number) {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function PromotePage({ embedded = false }: { embedded?: boolean }) {
  const { user, token, loading: authLoading } = useAuth();
  const [listings, setListings] = useState<FeaturedListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [serviceType, setServiceType] = useState('walking');
  const [saving, setSaving] = useState(false);
  const [deleteDialogId, setDeleteDialogId] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchListings();
  }, [user]);

  const fetchListings = async () => {
    try {
      const res = await fetch(`${API_BASE}/featured-listings/me`, { headers: getAuthHeaders(token) });
      if (res.ok) {
        const data = await res.json();
        setListings(data.listings);
      }
    } catch {
      setError('Failed to load campaigns.');
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
        body: JSON.stringify({ service_type: serviceType }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create');
      }
      setShowForm(false);
      fetchListings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create campaign');
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
      setError('Failed to update campaign.');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await fetch(`${API_BASE}/featured-listings/${id}`, { method: 'DELETE', headers: getAuthHeaders(token) });
      fetchListings();
    } catch {
      setError('Failed to delete campaign.');
    }
  };

  if (!embedded) {
    if (authLoading) return <div className="flex justify-center py-12" role="status" aria-live="polite"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div><span className="sr-only">Loading...</span></div>;
    if (!user) return <Navigate to="/login" replace />;
  }

  const totalImpressions = listings.reduce((s, l) => s + l.impressions, 0);
  const totalClicks = listings.reduce((s, l) => s + l.clicks, 0);
  const totalBookings = listings.reduce((s, l) => s + l.bookings_from_promotion, 0);
  const totalCommission = listings.reduce((s, l) => s + l.commission_earned_cents, 0);
  const activeCount = listings.filter(l => l.active).length;

  return (
    <div className={embedded ? '' : 'max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8'}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Megaphone className="w-6 h-6 text-emerald-600" />
          <h1 className="text-2xl font-bold text-stone-900">Promote</h1>
        </div>
        {!showForm && (
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4" /> New Campaign
          </Button>
        )}
      </div>

      {/* How it works */}
      <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5 mb-6">
        <h3 className="text-sm font-bold text-emerald-800 mb-2">How Promote works</h3>
        <ul className="text-sm text-emerald-700 space-y-1">
          <li>Your services appear with a <span className="font-semibold">Sponsored</span> badge at the top of search results</li>
          <li>You only pay a <span className="font-semibold">15% commission</span> on bookings that come from your promoted placement</li>
          <li>No upfront cost — commission is deducted from your payout when a promoted booking completes</li>
        </ul>
      </div>

      {/* Analytics Summary */}
      {listings.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-stone-100 p-4">
            <div className="flex items-center gap-1.5 text-stone-500 text-xs font-medium mb-1">
              <Eye className="w-3.5 h-3.5" /> Impressions
            </div>
            <div className="text-xl font-bold text-stone-900">{totalImpressions.toLocaleString()}</div>
          </div>
          <div className="bg-white rounded-xl border border-stone-100 p-4">
            <div className="flex items-center gap-1.5 text-stone-500 text-xs font-medium mb-1">
              <MousePointer className="w-3.5 h-3.5" /> Clicks
            </div>
            <div className="text-xl font-bold text-stone-900">{totalClicks.toLocaleString()}</div>
            {totalImpressions > 0 && (
              <div className="text-xs text-stone-400 mt-0.5">{((totalClicks / totalImpressions) * 100).toFixed(1)}% CTR</div>
            )}
          </div>
          <div className="bg-white rounded-xl border border-stone-100 p-4">
            <div className="flex items-center gap-1.5 text-stone-500 text-xs font-medium mb-1">
              <Calendar className="w-3.5 h-3.5" /> Bookings
            </div>
            <div className="text-xl font-bold text-emerald-700">{totalBookings}</div>
            {totalClicks > 0 && (
              <div className="text-xs text-stone-400 mt-0.5">{((totalBookings / totalClicks) * 100).toFixed(1)}% conversion</div>
            )}
          </div>
          <div className="bg-white rounded-xl border border-stone-100 p-4">
            <div className="flex items-center gap-1.5 text-stone-500 text-xs font-medium mb-1">
              <TrendingUp className="w-3.5 h-3.5" /> Commission
            </div>
            <div className="text-xl font-bold text-stone-900">{formatCurrency(totalCommission)}</div>
            <div className="text-xs text-stone-400 mt-0.5">15% of promoted bookings</div>
          </div>
        </div>
      )}

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} aria-label="Dismiss error" className="text-xs font-medium hover:underline">Dismiss</button>
          </AlertDescription>
        </Alert>
      )}

      {/* New Campaign Form */}
      {showForm && (
        <div className="bg-stone-50 rounded-xl border border-stone-200 p-6 mb-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-stone-900">Promote a Service</h3>
            <button onClick={() => { setShowForm(false); setError(null); }} aria-label="Close form" className="text-stone-400 hover:text-stone-600"><X className="w-4 h-4" /></button>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Service to promote</label>
            <select value={serviceType} onChange={e => setServiceType(e.target.value)}
              className="w-full p-3 border border-stone-200 rounded-lg text-sm">
              {Object.entries(SERVICE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>
          <div className="bg-white rounded-lg border border-stone-200 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-stone-700">Commission rate</span>
              <span className="text-sm font-bold text-stone-900">15%</span>
            </div>
            <p className="text-xs text-stone-400 mt-1">Only charged on completed bookings from promoted placement. Deducted from your payout.</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={saving}>
              <Save className="w-4 h-4" /> {saving ? 'Creating...' : 'Start Promoting'}
            </Button>
            <Button variant="outline" onClick={() => { setShowForm(false); setError(null); }}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Campaign List */}
      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div></div>
      ) : listings.length === 0 && !showForm ? (
        <div className="text-center py-16 bg-stone-50 rounded-xl border border-stone-200">
          <Megaphone className="w-12 h-12 mx-auto mb-4 text-stone-300" />
          <p className="text-stone-500 mb-2">No active campaigns</p>
          <p className="text-sm text-stone-400 mb-6">Promote your services to appear at the top of search results.</p>
          <Button onClick={() => setShowForm(true)}><Plus className="w-4 h-4" /> Create Campaign</Button>
        </div>
      ) : (
        <div className="space-y-3">
          {listings.map(listing => (
            <div key={listing.id} className={`bg-white rounded-xl border p-5 ${listing.active ? 'border-emerald-200' : 'border-stone-200 opacity-60'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-stone-900">
                    {listing.service_type ? SERVICE_LABELS[listing.service_type] || listing.service_type : 'All Services'}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${listing.active ? 'bg-emerald-100 text-emerald-700' : 'bg-stone-200 text-stone-500'}`}>
                    {listing.active ? 'Active' : 'Paused'}
                  </span>
                  <span className="text-xs text-stone-400">{(listing.commission_rate * 100).toFixed(0)}% commission</span>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => toggleActive(listing)}
                    className="p-2 text-stone-400 hover:text-emerald-600 rounded-lg hover:bg-emerald-50 transition-colors"
                    title={listing.active ? 'Pause' : 'Resume'}>
                    {listing.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <button onClick={() => setDeleteDialogId(listing.id)}
                    className="p-2 text-stone-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                    title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Per-campaign analytics */}
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-stone-50 rounded-lg p-3">
                  <div className="text-xs text-stone-500">Impressions</div>
                  <div className="text-sm font-bold text-stone-900">{listing.impressions.toLocaleString()}</div>
                </div>
                <div className="bg-stone-50 rounded-lg p-3">
                  <div className="text-xs text-stone-500">Clicks</div>
                  <div className="text-sm font-bold text-stone-900">{listing.clicks.toLocaleString()}</div>
                </div>
                <div className="bg-stone-50 rounded-lg p-3">
                  <div className="text-xs text-stone-500">Bookings</div>
                  <div className="text-sm font-bold text-emerald-700">{listing.bookings_from_promotion}</div>
                </div>
                <div className="bg-stone-50 rounded-lg p-3">
                  <div className="text-xs text-stone-500">Commission</div>
                  <div className="text-sm font-bold text-stone-900">{formatCurrency(listing.commission_earned_cents)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={deleteDialogId !== null} onOpenChange={(open) => { if (!open) setDeleteDialogId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Campaign</AlertDialogTitle>
            <AlertDialogDescription>Are you sure? Analytics data will be lost.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => { if (deleteDialogId !== null) handleDelete(deleteDialogId); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
