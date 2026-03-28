import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth, getAuthHeaders } from '../context/AuthContext';
import { API_BASE } from '../config';

export interface BookingHistoryItem {
  readonly id: number;
  readonly start_time: string;
  readonly end_time: string;
  readonly status: 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  readonly total_price: number | null;
  readonly service_type: string | null;
  readonly owner_name: string | null;
  readonly owner_avatar: string | null;
  readonly pets: ReadonlyArray<{ id: number; name: string }>;
}

export interface BookingHistoryFilters {
  readonly startDate: string;
  readonly endDate: string;
  readonly status: string;
  readonly search: string;
  readonly page: number;
  readonly limit: number;
}

export interface UseBookingHistoryReturn {
  readonly bookings: readonly BookingHistoryItem[];
  readonly total: number;
  readonly loading: boolean;
  readonly error: string | null;
  readonly filters: BookingHistoryFilters;
  readonly setStartDate: (v: string) => void;
  readonly setEndDate: (v: string) => void;
  readonly setStatus: (v: string) => void;
  readonly setSearch: (v: string) => void;
  readonly setPage: (v: number) => void;
}

const DEFAULT_LIMIT = 20;

export function useBookingHistory(): UseBookingHistoryReturn {
  const { token } = useAuth();
  const [bookings, setBookings] = useState<readonly BookingHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset to page 1 when filters change
  const prevFiltersRef = useRef({ startDate, endDate, status, debouncedSearch });
  useEffect(() => {
    const prev = prevFiltersRef.current;
    if (
      prev.startDate !== startDate ||
      prev.endDate !== endDate ||
      prev.status !== status ||
      prev.debouncedSearch !== debouncedSearch
    ) {
      setPage(1);
      prevFiltersRef.current = { startDate, endDate, status, debouncedSearch };
    }
  }, [startDate, endDate, status, debouncedSearch]);

  useEffect(() => {
    if (!token) return;

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    if (startDate) params.set('start', startDate);
    if (endDate) params.set('end', endDate);
    if (status) params.set('status', status);
    if (debouncedSearch) params.set('search', debouncedSearch);
    params.set('limit', String(DEFAULT_LIMIT));
    params.set('offset', String(computeOffset(page, DEFAULT_LIMIT)));

    fetch(`${API_BASE}/bookings?${params.toString()}`, {
      headers: getAuthHeaders(token),
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load booking history');
        return res.json();
      })
      .then((data: { bookings: BookingHistoryItem[]; total: number }) => {
        setBookings(data.bookings ?? []);
        setTotal(data.total ?? 0);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load booking history');
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [token, startDate, endDate, status, debouncedSearch, page]);

  const filters: BookingHistoryFilters = {
    startDate,
    endDate,
    status,
    search,
    page,
    limit: DEFAULT_LIMIT,
  };

  return {
    bookings,
    total,
    loading,
    error,
    filters,
    setStartDate,
    setEndDate,
    setStatus,
    setSearch,
    setPage,
  };
}

export function computeOffset(page: number, limit: number): number {
  return Math.max(0, (page - 1) * limit);
}
