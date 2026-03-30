import { useState, useEffect } from 'react';
import { useAuth, getAuthHeaders } from '../context/AuthContext';
import { useMode } from '../context/ModeContext';
import { API_BASE } from '../config';
import type { Booking } from '../types';

export interface TimelineItem {
  type: 'booking' | 'care_task' | 'availability';
  time: Date;
  endTime?: Date;
  id: number;
  data: Record<string, unknown>;
}

interface CareTask {
  id: number;
  booking_id: number;
  pet_id: number;
  pet_name: string;
  category: string;
  description: string;
  time: string | null;
  notes: string | null;
  scheduled_time: string | null;
  completed: boolean;
  completed_at: string | null;
  sitter_id: number;
  owner_id: number;
  booking_status: string;
}

interface Availability {
  id: number;
  start_time: string;
  end_time: string;
  recurring: boolean;
}

export function mergeTimeline(
  bookings: Booking[],
  careTasks: CareTask[],
  availabilities: Availability[],
): TimelineItem[] {
  const items: TimelineItem[] = [];

  for (const b of bookings) {
    items.push({
      type: 'booking',
      time: new Date(b.start_time),
      endTime: new Date(b.end_time),
      id: b.id,
      data: b as unknown as Record<string, unknown>,
    });
  }

  for (const t of careTasks) {
    if (!t.scheduled_time) continue;
    items.push({
      type: 'care_task',
      time: new Date(t.scheduled_time),
      id: t.id,
      data: t as unknown as Record<string, unknown>,
    });
  }

  for (const a of availabilities) {
    items.push({
      type: 'availability',
      time: new Date(a.start_time),
      endTime: new Date(a.end_time),
      id: a.id,
      data: a as unknown as Record<string, unknown>,
    });
  }

  return items.sort((a, b) => a.time.getTime() - b.time.getTime());
}

export function useTodaySchedule(bookings: Booking[]) {
  const { user, token } = useAuth();
  const { mode } = useMode();
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
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
    const tzOffset = new Date().getTimezoneOffset();

    const fetchSchedule = async () => {
      setLoading(true);
      setError(null);

      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

      // Filter bookings to today
      const todayBookings = bookings.filter((b) => {
        const start = new Date(b.start_time);
        const end = new Date(b.end_time);
        const isActive = b.status === 'confirmed' || b.status === 'pending' || b.status === 'in_progress';
        return isActive && start < endOfDay && end > startOfDay;
      });

      // Fetch care tasks for today
      const careTasksRes = await fetch(
        `${API_BASE}/care-tasks/today?tzOffset=${tzOffset}`,
        opts,
      );

      if (controller.signal.aborted) return;

      const careTasks: CareTask[] = careTasksRes.ok
        ? (await careTasksRes.json()).tasks
        : [];

      // Fetch availability (sitter mode only)
      let availabilities: Availability[] = [];
      if (mode === 'sitter' && user.roles?.includes('sitter')) {
        const availRes = await fetch(
          `${API_BASE}/availability/${user.id}`,
          opts,
        );
        if (availRes.ok) {
          const allAvail = (await availRes.json()).availability || [];
          availabilities = allAvail.filter((a: Availability) => {
            const start = new Date(a.start_time);
            const end = new Date(a.end_time);
            return start < endOfDay && end > startOfDay;
          });
        }
      }

      setTimeline(mergeTimeline(todayBookings, careTasks, availabilities));
      setLoading(false);
    };

    fetchSchedule().catch((err) => {
      if (err.name !== 'AbortError') {
        setError('Failed to load schedule');
      }
      setLoading(false);
    });

    return () => controller.abort();
  }, [user, token, mode, bookings]);

  return { timeline, loading, error };
}
