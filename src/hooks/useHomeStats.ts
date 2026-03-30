import { useState, useEffect } from 'react';
import { useAuth, getAuthHeaders } from '../context/AuthContext';
import { useMode } from '../context/ModeContext';
import { API_BASE } from '../config';

export interface OwnerStats {
  upcomingBookings: number;
  inProgressBookings: number;
  petCount: number;
  favoriteSitters: number;
}

export interface SitterStats {
  revenueThisMonth: number;
  upcomingBookings: number;
  avgRating: number | null;
  reviewCount: number;
  avgResponseHours: number | null;
}

interface AnalyticsOverview {
  total_revenue: number;
  avg_rating: number | null;
  review_count: number;
  avg_response_hours: number | null;
}

export function useHomeStats() {
  const { user, token } = useAuth();
  const { mode } = useMode();
  const [ownerStats, setOwnerStats] = useState<OwnerStats | null>(null);
  const [sitterStats, setSitterStats] = useState<SitterStats | null>(null);
  const [loading, setLoading] = useState(true);

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

      if (mode === 'owner') {
        const [bookingsRes, petsRes, favoritesRes] = await Promise.all([
          fetch(`${API_BASE}/bookings`, opts),
          fetch(`${API_BASE}/pets`, opts),
          fetch(`${API_BASE}/favorites`, opts),
        ]);

        if (controller.signal.aborted) return;

        const bookings = bookingsRes.ok ? (await bookingsRes.json()).bookings : [];
        const pets = petsRes.ok ? (await petsRes.json()).pets : [];
        const favorites = favoritesRes.ok ? (await favoritesRes.json()).favorites : [];

        const now = new Date();
        const myBookings = bookings.filter((b: { owner_id: number }) => b.owner_id === user.id);

        setOwnerStats({
          upcomingBookings: myBookings.filter(
            (b: { status: string; start_time: string }) =>
              (b.status === 'confirmed' || b.status === 'pending') && new Date(b.start_time) > now,
          ).length,
          inProgressBookings: myBookings.filter(
            (b: { status: string }) => b.status === 'in_progress',
          ).length,
          petCount: pets.length,
          favoriteSitters: favorites.length,
        });
        setSitterStats(null);
      } else {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();

        const [bookingsRes, analyticsRes] = await Promise.all([
          fetch(`${API_BASE}/bookings`, opts),
          fetch(`${API_BASE}/analytics/overview?start=${monthStart}&end=${monthEnd}`, opts),
        ]);

        if (controller.signal.aborted) return;

        const bookings = bookingsRes.ok ? (await bookingsRes.json()).bookings : [];
        const analytics: AnalyticsOverview | null = analyticsRes.ok ? await analyticsRes.json() : null;

        const myBookings = bookings.filter((b: { sitter_id: number }) => b.sitter_id === user.id);

        setSitterStats({
          revenueThisMonth: analytics?.total_revenue ?? 0,
          upcomingBookings: myBookings.filter(
            (b: { status: string; start_time: string }) =>
              (b.status === 'confirmed' || b.status === 'pending') && new Date(b.start_time) > now,
          ).length,
          avgRating: analytics?.avg_rating ?? null,
          reviewCount: analytics?.review_count ?? 0,
          avgResponseHours: analytics?.avg_response_hours ?? null,
        });
        setOwnerStats(null);
      }

      setLoading(false);
    };

    fetchStats().catch(() => setLoading(false));

    return () => controller.abort();
  }, [user, token, mode]);

  return { ownerStats, sitterStats, loading, mode };
}
