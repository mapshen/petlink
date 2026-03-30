import { useState, useEffect } from 'react';
import { useAuth, getAuthHeaders } from '../context/AuthContext';
import { useMode } from '../context/ModeContext';
import { API_BASE } from '../config';
import {
  computeOwnerStats,
  computeSitterStats,
  type OwnerStats,
  type SitterStats,
  type AnalyticsOverview,
} from './homeStatsUtils';

export type { OwnerStats, SitterStats } from './homeStatsUtils';

interface Booking {
  status: string;
  start_time: string;
  owner_id: number;
  sitter_id: number;
}

export function useHomeStats(bookings: Booking[]) {
  const { user, token } = useAuth();
  const { mode } = useMode();
  const [ownerStats, setOwnerStats] = useState<OwnerStats | null>(null);
  const [sitterStats, setSitterStats] = useState<SitterStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !token) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const headers = getAuthHeaders(token);
    const opts = { headers, signal: controller.signal };

    const fetchStats = async () => {
      setLoading(true);
      setError(null);

      if (mode === 'owner') {
        const [petsRes, favoritesRes] = await Promise.all([
          fetch(`${API_BASE}/pets`, opts),
          fetch(`${API_BASE}/favorites`, opts),
        ]);

        if (controller.signal.aborted) return;

        const pets = petsRes.ok ? (await petsRes.json()).pets : [];
        const favorites = favoritesRes.ok ? (await favoritesRes.json()).favorites : [];

        setOwnerStats(computeOwnerStats(bookings, user.id, pets.length, favorites.length));
        setSitterStats(null);
      } else {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

        const analyticsRes = await fetch(
          `${API_BASE}/analytics/overview?start=${monthStart}&end=${monthEnd}`,
          opts,
        );

        if (controller.signal.aborted) return;

        const analytics: AnalyticsOverview | null = analyticsRes.ok
          ? await analyticsRes.json()
          : null;

        setSitterStats(computeSitterStats(bookings, user.id, analytics));
        setOwnerStats(null);
      }

      setLoading(false);
    };

    fetchStats().catch((err) => {
      if (err.name !== 'AbortError') {
        setError('Failed to load stats');
      }
      setLoading(false);
    });

    return () => controller.abort();
  }, [user, token, mode, bookings]);

  return { ownerStats, sitterStats, loading, error, mode };
}
