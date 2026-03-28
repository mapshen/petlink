import React, { useState, useCallback } from 'react';
import { format } from 'date-fns';
import { CalendarDays, Plus } from 'lucide-react';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { useCalendar } from '../../hooks/useCalendar';
import MiniCalendar from './MiniCalendar';
import CalendarAgenda from './CalendarAgenda';
import AvailabilityForm from './AvailabilityForm';
import CalendarExportDialog from './CalendarExportDialog';
import { API_BASE } from '../../config';

export default function CalendarCommandCenter() {
  const { token } = useAuth();
  const { events, eventsByDate, loading, error: fetchError, currentDate, goNext, goPrev, refetch } =
    useCalendar();

  const [selectedDay, setSelectedDay] = useState<Date | null>(() => new Date());
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [showAvailabilityForm, setShowAvailabilityForm] = useState(false);
  const [availabilityFormDate, setAvailabilityFormDate] = useState<Date | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const error = fetchError || actionError;

  const selectedDayKey = selectedDay ? format(selectedDay, 'yyyy-MM-dd') : null;
  const selectedDayEvents = selectedDayKey ? (eventsByDate.get(selectedDayKey) ?? []) : [];

  const handleAddAvailability = useCallback((date: Date) => {
    setAvailabilityFormDate(date);
    setShowAvailabilityForm(true);
  }, []);

  const handleDeleteAvailability = useCallback(async (availabilityId: number) => {
    try {
      const res = await fetch(`${API_BASE}/availability/${availabilityId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(token),
      });
      if (!res.ok) throw new Error('Failed to delete availability');
      refetch();
    } catch {
      setActionError('Failed to delete availability. Please try again.');
    }
  }, [token, refetch]);

  const handleBookingAction = useCallback(async (bookingId: number, action: 'confirm' | 'cancel') => {
    try {
      const status = action === 'confirm' ? 'confirmed' : 'cancelled';
      const res = await fetch(`${API_BASE}/bookings/${bookingId}/status`, {
        method: 'PUT',
        headers: getAuthHeaders(token),
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Failed to update booking');
      refetch();
    } catch {
      setActionError('Failed to update booking. Please try again.');
    }
  }, [token, refetch]);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-8 flex items-center justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl bg-red-50 border border-red-200 p-4 text-sm text-red-700 shadow-sm">
        {error}
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
        {/* Header bar */}
        <div className="px-5 py-3 border-b border-stone-100 bg-stone-50/50 flex items-center justify-between">
          <h2 className="text-base font-semibold text-stone-900">Calendar</h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setAvailabilityFormDate(selectedDay ?? new Date());
                setShowAvailabilityForm(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-600 border border-emerald-200 rounded-lg hover:bg-emerald-50 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Add Availability</span>
            </button>
            <button
              type="button"
              onClick={() => setSubscribeOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-600 border border-stone-300 rounded-lg hover:bg-stone-50 transition-colors"
              title="Subscribe to iCal"
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">iCal</span>
            </button>
          </div>
        </div>

        {/* Two-column layout */}
        <div className="flex flex-col lg:flex-row gap-0">
          {/* Left: Mini Calendar */}
          <div className="lg:w-80 shrink-0 p-4 lg:border-r border-b lg:border-b-0 border-stone-100">
            <MiniCalendar
              currentDate={currentDate}
              eventsByDate={eventsByDate}
              selectedDay={selectedDay}
              onDaySelect={setSelectedDay}
              onPrev={goPrev}
              onNext={goNext}
            />
          </div>

          {/* Right: Agenda */}
          <div className="flex-1 p-4 min-w-0">
            <CalendarAgenda
              selectedDay={selectedDay}
              selectedDayEvents={selectedDayEvents}
              allEvents={events}
              onAddAvailability={handleAddAvailability}
              onDeleteAvailability={handleDeleteAvailability}
              onBookingAction={handleBookingAction}
            />
          </div>
        </div>
      </div>

      {/* Dialogs */}
      {subscribeOpen && <CalendarExportDialog onClose={() => setSubscribeOpen(false)} />}
      {showAvailabilityForm && (
        <AvailabilityForm
          date={availabilityFormDate}
          onClose={() => setShowAvailabilityForm(false)}
          onSaved={refetch}
        />
      )}
    </>
  );
}
