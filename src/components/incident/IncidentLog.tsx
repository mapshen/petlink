import React, { useEffect, useState } from 'react';
import type { IncidentReport } from '../../types';
import { getAuthHeaders } from '../../context/AuthContext';
import { API_BASE } from '../../config';
import IncidentCard from './IncidentCard';
import { AlertTriangle } from 'lucide-react';

interface Props {
  readonly bookingId: number;
  readonly token: string | null;
  readonly currentUserId?: number;
  readonly refreshKey?: number;
}

export default function IncidentLog({ bookingId, token, currentUserId, refreshKey }: Props) {
  const [incidents, setIncidents] = useState<IncidentReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const fetchIncidents = async () => {
      try {
        const res = await fetch(`${API_BASE}/incidents/booking/${bookingId}`, {
          headers: getAuthHeaders(token),
          signal: controller.signal,
        });
        if (res.ok) {
          const data = await res.json();
          setIncidents(data.incidents);
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          // Non-critical — incidents just won't load
        }
      } finally {
        setLoading(false);
      }
    };
    fetchIncidents();
    return () => controller.abort();
  }, [bookingId, token, refreshKey]);

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-500" />
      </div>
    );
  }

  if (incidents.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-red-500" />
        <span className="text-sm font-bold text-stone-900">
          Incident Reports ({incidents.length})
        </span>
      </div>
      {incidents.map((incident) => (
        <IncidentCard key={incident.id} incident={incident} currentUserId={currentUserId} />
      ))}
    </div>
  );
}
