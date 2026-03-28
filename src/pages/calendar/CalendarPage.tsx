import React, { useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight, CalendarDays, List, Calendar } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useMode } from '../../context/ModeContext';
import { useCalendar } from '../../hooks/useCalendar';
import MonthView from '../../components/calendar/MonthView';
import WeekView from '../../components/calendar/WeekView';
import ListView from '../../components/calendar/ListView';
import DayDetail from '../../components/calendar/DayDetail';
import AvailabilityForm from '../../components/calendar/AvailabilityForm';
import CalendarExportDialog from '../../components/calendar/CalendarExportDialog';
import { API_BASE } from '../../config';

type ViewMode = 'month' | 'week' | 'list';

function getPeriodLabel(view: ViewMode, currentDate: Date): string {
  if (view === 'month' || view === 'list') {
    return format(currentDate, 'MMMM yyyy');
  }
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
  if (format(weekStart, 'MMM') !== format(weekEnd, 'MMM')) {
    return `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'MMM d, yyyy')}`;
  }
  return `${format(weekStart, 'MMM d')} – ${format(weekEnd, 'd, yyyy')}`;
}

export default function CalendarPage() {
  const { user } = useAuth();
  const { mode } = useMode();
  const { events, eventsByDate, loading, error, currentDate, view, setView, goNext, goPrev, goToday, refetch } =
    useCalendar();

  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const [availabilityFormDate, setAvailabilityFormDate] = useState<Date | null>(null);
  const [showAvailabilityForm, setShowAvailabilityForm] = useState(false);

  // Guard: must be sitter or both-in-sitter-mode
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'owner' || (user.role === 'both' && mode !== 'sitter')) {
    return <Navigate to="/dashboard" replace />;
  }

  const periodLabel = getPeriodLabel(view, currentDate);
  const selectedDayKey = selectedDay ? format(selectedDay, 'yyyy-MM-dd') : null;
  const selectedDayEvents = selectedDayKey ? (eventsByDate.get(selectedDayKey) ?? []) : [];

  const handleAddAvailability = useCallback((date: Date) => {
    setAvailabilityFormDate(date);
    setShowAvailabilityForm(true);
  }, []);

  const handleDeleteAvailability = useCallback(async (availabilityId: number) => {
    const token = localStorage.getItem('petlink_token');
    await fetch(`${API_BASE}/availability/${availabilityId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    refetch();
  }, [refetch]);

  const handleBookingAction = useCallback(async (bookingId: number, action: 'confirm' | 'cancel') => {
    const token = localStorage.getItem('petlink_token');
    const status = action === 'confirm' ? 'confirmed' : 'cancelled';
    await fetch(`${API_BASE}/bookings/${bookingId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status }),
    });
    refetch();
  }, [refetch]);

  const viewButtons: { key: ViewMode; label: string; icon: React.ReactNode }[] = [
    { key: 'month', label: 'Month', icon: <Calendar className="w-3.5 h-3.5" /> },
    { key: 'week', label: 'Week', icon: <CalendarDays className="w-3.5 h-3.5" /> },
    { key: 'list', label: 'List', icon: <List className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Header */}
      <div className="bg-white border-b border-stone-200 px-4 py-3 md:px-6 md:py-4">
        <div className="max-w-7xl mx-auto flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-stone-900">Calendar</h1>
            <div className="flex items-center gap-1">
              <button onClick={goPrev} aria-label="Previous period" className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-100 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm font-medium text-stone-700 min-w-[140px] text-center">{periodLabel}</span>
              <button onClick={goNext} aria-label="Next period" className="p-1.5 rounded-lg text-stone-500 hover:bg-stone-100 transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={goToday} className="px-3 py-1.5 text-sm font-medium text-stone-700 border border-stone-300 rounded-lg hover:bg-stone-50 transition-colors">
              Today
            </button>

            <div className="flex items-center border border-stone-300 rounded-lg overflow-hidden">
              {viewButtons.map(({ key, label, icon }) => (
                <button
                  key={key}
                  onClick={() => setView(key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors ${
                    view === key ? 'bg-emerald-600 text-white' : 'text-stone-600 hover:bg-stone-50'
                  }`}
                  aria-pressed={view === key}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>

            <button
              onClick={() => setSubscribeOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-stone-700 border border-stone-300 rounded-lg hover:bg-stone-50 transition-colors"
              title="Subscribe to calendar"
            >
              <CalendarDays className="w-4 h-4" />
              <span className="hidden sm:inline">Subscribe</span>
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-7xl mx-auto px-4 py-4 md:px-6 md:py-6">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600"></div>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl bg-red-50 border border-red-200 p-4 text-sm text-red-700 shadow-sm">{error}</div>
        )}

        {!loading && !error && (
          <div className="flex gap-4">
            <div className="flex-1 bg-white rounded-2xl shadow-sm border border-stone-200 overflow-hidden">
              {view === 'month' && (
                <MonthView currentDate={currentDate} eventsByDate={eventsByDate} selectedDay={selectedDay} onDaySelect={setSelectedDay} />
              )}
              {view === 'week' && (
                <WeekView currentDate={currentDate} eventsByDate={eventsByDate} selectedDay={selectedDay} onDaySelect={setSelectedDay} />
              )}
              {view === 'list' && (
                <ListView currentDate={currentDate} eventsByDate={eventsByDate} onDaySelect={setSelectedDay} />
              )}
            </div>

            {/* DayDetail desktop sidebar */}
            {selectedDay && (
              <div className="hidden md:block">
                <DayDetail
                  date={selectedDay}
                  events={selectedDayEvents}
                  onClose={() => setSelectedDay(null)}
                  onAddAvailability={handleAddAvailability}
                  onDeleteAvailability={handleDeleteAvailability}
                  onBookingAction={handleBookingAction}
                />
              </div>
            )}
          </div>
        )}

        {/* DayDetail mobile bottom sheet */}
        {selectedDay && (
          <div className="md:hidden">
            <DayDetail
              date={selectedDay}
              events={selectedDayEvents}
              onClose={() => setSelectedDay(null)}
              onAddAvailability={handleAddAvailability}
              onDeleteAvailability={handleDeleteAvailability}
              onBookingAction={handleBookingAction}
            />
          </div>
        )}
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
    </div>
  );
}
