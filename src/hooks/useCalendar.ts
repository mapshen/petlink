import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  format,
} from 'date-fns';
import { API_BASE } from '../config';
import { CalendarEvent } from '../types';

type ViewMode = 'month' | 'week' | 'list';

interface UseCalendarReturn {
  events: CalendarEvent[];
  eventsByDate: Map<string, CalendarEvent[]>;
  loading: boolean;
  error: string | null;
  currentDate: Date;
  view: ViewMode;
  setView: (view: ViewMode) => void;
  goNext: () => void;
  goPrev: () => void;
  goToday: () => void;
  refetch: () => void;
}

function computeRange(view: ViewMode, date: Date): { rangeStart: Date; rangeEnd: Date } {
  if (view === 'week') {
    return {
      rangeStart: startOfWeek(date, { weekStartsOn: 0 }),
      rangeEnd: endOfWeek(date, { weekStartsOn: 0 }),
    };
  }
  // month and list both use full month
  return {
    rangeStart: startOfMonth(date),
    rangeEnd: endOfMonth(date),
  };
}

export function useCalendar(): UseCalendarReturn {
  const [view, setView] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchTick, setFetchTick] = useState(0);

  const { rangeStart, rangeEnd } = useMemo(
    () => computeRange(view, currentDate),
    [view, currentDate]
  );

  useEffect(() => {
    const token = localStorage.getItem('petlink_token');
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
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
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
  }, [rangeStart, rangeEnd, fetchTick]);

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = event.start.slice(0, 10); // YYYY-MM-DD
      const existing = map.get(key) ?? [];
      map.set(key, [...existing, event]);
    }
    return map;
  }, [events]);

  const goNext = useCallback(() => {
    setCurrentDate((prev) => (view === 'week' ? addWeeks(prev, 1) : addMonths(prev, 1)));
  }, [view]);

  const goPrev = useCallback(() => {
    setCurrentDate((prev) => (view === 'week' ? subWeeks(prev, 1) : subMonths(prev, 1)));
  }, [view]);

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
    view,
    setView,
    goNext,
    goPrev,
    goToday,
    refetch,
  };
}
