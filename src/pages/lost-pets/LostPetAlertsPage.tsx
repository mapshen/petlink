import React, { useEffect, useState, useCallback } from 'react';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { useMode } from '../../context/ModeContext';
import { API_BASE } from '../../config';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { AlertTriangle, Loader2, MapPin, Plus, Clock } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { LostPetAlert, Pet } from '../../types';
import CreateAlertDialog from '../../components/lost-pets/CreateAlertDialog';
import AlertDetailCard from '../../components/lost-pets/AlertDetailCard';

export default function LostPetAlertsPage() {
  useDocumentTitle('Lost Pet Alerts');
  const { user, token } = useAuth();
  const { mode } = useMode();
  const [alerts, setAlerts] = useState<LostPetAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [pets, setPets] = useState<Pet[]>([]);
  const [selectedAlert, setSelectedAlert] = useState<LostPetAlert | null>(null);

  const isSitter = mode === 'sitter' || user?.roles?.includes('sitter');

  const fetchNearbyAlerts = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/lost-pet-alerts/nearby`, {
        headers: getAuthHeaders(token),
      });
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts);
      }
    } catch {
      // Non-critical
    }
  }, [token]);

  const fetchPets = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/pets`, { headers: getAuthHeaders(token) });
      if (res.ok) {
        const data = await res.json();
        setPets(data.pets);
      }
    } catch {
      // Non-critical
    }
  }, [token]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchNearbyAlerts(), fetchPets()]);
      setLoading(false);
    };
    load();
  }, [fetchNearbyAlerts, fetchPets]);

  const handleCreateAlert = async (body: Record<string, unknown>) => {
    const res = await fetch(`${API_BASE}/lost-pet-alerts`, {
      method: 'POST',
      headers: getAuthHeaders(token),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create alert');
    }
    const data = await res.json();
    setAlerts((prev) => [data.alert, ...prev]);
    setShowCreate(false);
    return data.alert;
  };

  const handleResolve = async (alertId: number, status: 'found' | 'cancelled') => {
    const res = await fetch(`${API_BASE}/lost-pet-alerts/${alertId}/resolve`, {
      method: 'PUT',
      headers: getAuthHeaders(token),
      body: JSON.stringify({ status }),
    });
    if (res.ok) {
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
      setSelectedAlert(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 text-amber-500" />
          <h1 className="text-xl font-bold text-stone-800">Lost Pet Alerts</h1>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-medium hover:bg-red-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Report Lost Pet
        </button>
      </div>

      {isSitter && alerts.length === 0 && (
        <div className="text-center py-12">
          <MapPin className="w-12 h-12 text-stone-300 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-stone-700">No Active Alerts Nearby</h2>
          <p className="text-sm text-stone-400 mt-1">
            There are no lost pet alerts in your area right now.
          </p>
        </div>
      )}

      {alerts.length > 0 && (
        <div className="space-y-4">
          {alerts.map((alert) => (
            <button
              key={alert.id}
              onClick={() => setSelectedAlert(alert)}
              className="w-full text-left bg-white rounded-2xl shadow-sm border border-stone-100 p-4 hover:border-amber-200 transition-colors"
            >
              <div className="flex items-start gap-4">
                {(alert.photo_url || alert.pet_photo_url) && (
                  <img
                    src={alert.photo_url || alert.pet_photo_url || ''}
                    alt={alert.pet_name || 'Pet'}
                    className="w-16 h-16 rounded-xl object-cover flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-stone-800">{alert.pet_name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                      {alert.pet_species}
                    </span>
                    {alert.status === 'active' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Missing
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-stone-500 line-clamp-2">{alert.description}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-stone-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Last seen {formatDistanceToNow(new Date(alert.last_seen_at), { addSuffix: true })}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {alert.search_radius_miles} mi radius
                    </span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateAlertDialog
          pets={pets}
          onClose={() => setShowCreate(false)}
          onSubmit={handleCreateAlert}
        />
      )}

      {selectedAlert && (
        <AlertDetailCard
          alert={selectedAlert}
          isOwner={selectedAlert.owner_id === user?.id}
          onResolve={handleResolve}
          onClose={() => setSelectedAlert(null)}
        />
      )}
    </div>
  );
}
