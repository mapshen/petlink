import { useState, useEffect } from 'react';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { Plus, Trash2, Loader2, Clock } from 'lucide-react';
import { EmptyState } from '../../components/ui/EmptyState';
import { API_BASE } from '../../config';

interface AvailabilitySlot {
  id: number;
  sitter_id: number;
  day_of_week: number | null;
  specific_date: string | null;
  start_time: string;
  end_time: string;
  recurring: boolean;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export default function AvailabilityTab() {
  const { user, token } = useAuth();
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingDay, setAddingDay] = useState<number | null>(null);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    const fetchSlots = async () => {
      try {
        const res = await fetch(`${API_BASE}/availability/${user.id}`, {
          headers: getAuthHeaders(token),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error('Failed to load availability');
        const data = await res.json();
        if (!controller.signal.aborted) setSlots(data.slots || []);
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          setError('Failed to load availability.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    fetchSlots();
    return () => controller.abort();
  }, [user, token]);

  const recurringSlots = slots.filter((s) => s.recurring);
  const slotsByDay = DAYS.map((_, i) =>
    recurringSlots.filter((s) => s.day_of_week === i),
  );

  const handleAdd = async () => {
    if (addingDay === null) return;
    if (startTime >= endTime) {
      setError('End time must be after start time');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/availability`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          day_of_week: addingDay,
          start_time: startTime,
          end_time: endTime,
          recurring: true,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to add availability');
      }
      const data = await res.json();
      setSlots((prev) => [...prev, data.slot]);
      setAddingDay(null);
      setStartTime('09:00');
      setEndTime('17:00');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add availability');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/availability/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(token),
      });
      if (!res.ok) throw new Error('Failed to delete');
      setSlots((prev) => prev.filter((s) => s.id !== id));
    } catch {
      setError('Failed to delete availability slot.');
    } finally {
      setDeletingId(null);
    }
  };

  const formatTime = (time: string) => {
    const [h, m] = time.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const hour = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${hour}:${m.toString().padStart(2, '0')} ${period}`;
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8" role="status" aria-live="polite">
        <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
        <span className="sr-only">Loading availability...</span>
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-xs font-medium hover:underline">Dismiss</button>
        </div>
      )}

      {slots.length === 0 && addingDay === null && (
        <div className="mb-4">
          <EmptyState
            icon={Clock}
            title="No availability set"
            description="Add time slots so pet owners know when you're available."
          />
        </div>
      )}

      {/* Weekly Schedule */}
      <div className="space-y-3">
        {DAYS.map((day, dayIndex) => {
          const daySlots = slotsByDay[dayIndex];
          const isAdding = addingDay === dayIndex;

          return (
            <div key={day} className="flex items-start gap-4">
              <div className="w-10 pt-2">
                <span className={`text-sm font-semibold ${daySlots.length > 0 ? 'text-stone-900' : 'text-stone-400'}`}>
                  {SHORT_DAYS[dayIndex]}
                </span>
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap gap-2 items-center min-h-[36px]">
                  {daySlots.map((slot) => (
                    <div
                      key={slot.id}
                      className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg text-sm font-medium"
                    >
                      <span>{formatTime(slot.start_time)} — {formatTime(slot.end_time)}</span>
                      <button
                        onClick={() => handleDelete(slot.id)}
                        disabled={deletingId === slot.id}
                        className="text-emerald-400 hover:text-red-500 transition-colors disabled:opacity-50"
                        aria-label={`Remove ${day} ${formatTime(slot.start_time)} slot`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}

                  {daySlots.length === 0 && !isAdding && (
                    <span className="text-sm text-stone-400">Unavailable</span>
                  )}

                  {isAdding ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        aria-label={`Start time for ${day}`}
                        className="px-2 py-1.5 border border-stone-200 rounded-lg text-sm"
                      />
                      <span className="text-stone-400">—</span>
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        aria-label={`End time for ${day}`}
                        className="px-2 py-1.5 border border-stone-200 rounded-lg text-sm"
                      />
                      <button
                        onClick={handleAdd}
                        disabled={saving}
                        className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {saving ? 'Adding...' : 'Add'}
                      </button>
                      <button
                        onClick={() => setAddingDay(null)}
                        className="text-stone-400 hover:text-stone-600 text-xs font-medium"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setAddingDay(dayIndex);
                        setStartTime('09:00');
                        setEndTime('17:00');
                      }}
                      className="text-emerald-600 hover:text-emerald-700 text-xs font-semibold flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-stone-400 mt-6">
        Set your recurring weekly availability. Pet owners will only be able to book during these times.
      </p>
    </div>
  );
}
