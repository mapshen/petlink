import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  startOfMonth,
  endOfMonth,
  addMonths,
  subMonths,
  format,
} from 'date-fns';
import { useAuth, getAuthHeaders } from '../context/AuthContext';
import { API_BASE } from '../config';
import { CalendarEvent } from '../types';

interface UseCalendarReturn {
  events: CalendarEvent[];
  eventsByDate: Map<string, CalendarEvent[]>;
  loading: boolean;
  error: string | null;
  currentDate: Date;
  goNext: () => void;
  goPrev: () => void;
  goToday: () => void;
  refetch: () => void;
}

export function useCalendar(): UseCalendarReturn {
  const { token } = useAuth();
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchTick, setFetchTick] = useState(0);

  const rangeStart = useMemo(() => startOfMonth(currentDate), [currentDate]);
  const rangeEnd = useMemo(() => endOfMonth(currentDate), [currentDate]);

  useEffect(() => {
    if (!token) {
      setError('Not authenticated');
      return;
    }

    const start = format(rangeStart, 'yyyy-MM-dd');
    const end = format(rangeEnd, 'yyyy-MM-dd');

    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetch(`${API_BASE}/calendar?start=${start}&end=${end}`, {
      headers: getAuthHeaders(token),
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load calendar events (${res.status})`);
        return res.json();
      })
      .then((data: { events: CalendarEvent[] }) => {
        setEvents(data.events ?? []);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'Failed to load calendar events');
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [token, rangeStart, rangeEnd, fetchTick]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = event.start.slice(0, 10);
      const existing = map.get(key) ?? [];
      map.set(key, [...existing, event]);
    }
    return map;
  }, [events]);

  const goNext = useCallback(() => {
    setCurrentDate((prev) => addMonths(prev, 1));
  }, []);

  const goPrev = useCallback(() => {
    setCurrentDate((prev) => subMonths(prev, 1));
  }, []);

  const goToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  const refetch = useCallback(() => {
    setFetchTick((t) => t + 1);
  }, []);

  return {
    events,
    eventsByDate,
    loading,
    error,
    currentDate,
    goNext,
    goPrev,
    goToday,
    refetch,
  };
}
