import React, { useMemo } from 'react';
import { format, parseISO, isAfter, startOfDay, isSameDay, isTomorrow, isToday } from 'date-fns';
import { Clock, User, Check, XCircle, Trash2, Plus } from 'lucide-react';
import { CalendarEvent } from '../../types';

interface CalendarAgendaProps {
  selectedDay: Date | null;
  selectedDayEvents: CalendarEvent[];
  allEvents: CalendarEvent[];
  onAddAvailability: (date: Date) => void;
  onDeleteAvailability: (availabilityId: number) => void;
  onBookingAction: (bookingId: number, action: 'confirm' | 'cancel') => void;
}

function formatTimeRange(start: string, end: string): string {
  return `${format(parseISO(start), 'h:mm a')} – ${format(parseISO(end), 'h:mm a')}`;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    confirmed: 'bg-emerald-100 text-emerald-700',
    pending: 'bg-amber-100 text-amber-700',
    in_progress: 'bg-blue-100 text-blue-700',
    completed: 'bg-stone-100 text-stone-600',
    cancelled: 'bg-red-100 text-red-600',
  };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${colors[status] || 'bg-stone-100 text-stone-600'}`}>
      {status.replace('_', ' ')}
    </span>
  );
}

function getBorderColor(status?: string): string {
  switch (status) {
    case 'confirmed': return 'border-l-emerald-500';
    case 'pending': return 'border-l-amber-500';
    case 'in_progress': return 'border-l-blue-500';
    case 'completed': return 'border-l-stone-400';
    case 'cancelled': return 'border-l-red-400';
    default: return 'border-l-stone-300';
  }
}

function EventCard({
  event,
  onBookingAction,
  onDeleteAvailability,
}: {
  event: CalendarEvent;
  onBookingAction: (bookingId: number, action: 'confirm' | 'cancel') => void;
  onDeleteAvailability: (availabilityId: number) => void;
}) {
  if (event.type === 'availability') {
    return (
      <div className="rounded-xl border border-dashed border-emerald-300 p-3 bg-emerald-50/50">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-medium text-emerald-700">Available</p>
              {event.recurring && (
                <span className="text-[10px] bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full font-medium">
                  Recurring
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-600">
              <Clock size={12} className="shrink-0" />
              <span>{formatTimeRange(event.start, event.end)}</span>
            </div>
          </div>
          {event.availability_id !== undefined && (
            <button
              type="button"
              onClick={() => onDeleteAvailability(event.availability_id!)}
              className="shrink-0 p-1.5 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              aria-label="Delete availability"
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    );
  }

  const borderColor = getBorderColor(event.status);
  return (
    <div className={`rounded-xl border border-stone-200 border-l-4 ${borderColor} p-3 bg-white shadow-sm`}>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="text-sm font-medium text-stone-800 leading-tight">{event.title}</p>
        {event.status && <StatusBadge status={event.status} />}
      </div>
      <div className="flex items-center gap-1.5 text-xs text-stone-500 mb-1.5">
        <Clock size={12} className="shrink-0" />
        <span>{formatTimeRange(event.start, event.end)}</span>
      </div>
      {event.pet_names && event.pet_names.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {event.pet_names.map((name) => (
            <span key={name} className="text-[10px] bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full">
              {name}
            </span>
          ))}
        </div>
      )}
      {event.owner_name && (
        <div className="flex items-center gap-1.5 mb-1.5">
          {event.owner_avatar ? (
            <img src={event.owner_avatar} alt={event.owner_name} className="w-5 h-5 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-5 h-5 rounded-full bg-stone-200 flex items-center justify-center shrink-0">
              <User size={10} className="text-stone-500" />
            </div>
          )}
          <span className="text-xs text-stone-500">{event.owner_name}</span>
        </div>
      )}
      {event.status === 'pending' && (
        <div className="flex gap-2 mt-2 pt-2 border-t border-stone-100">
          <button
            type="button"
            onClick={() => onBookingAction(event.id, 'confirm')}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 transition-colors rounded-lg py-1.5"
          >
            <Check size={12} />
            Accept
          </button>
          <button
            type="button"
            onClick={() => onBookingAction(event.id, 'cancel')}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 transition-colors rounded-lg py-1.5"
          >
            <XCircle size={12} />
            Decline
          </button>
        </div>
      )}
    </div>
  );
}

function formatDateHeader(date: Date): string {
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  return format(date, 'EEEE, MMMM d');
}

export default function CalendarAgenda({
  selectedDay,
  selectedDayEvents,
  allEvents,
  onAddAvailability,
  onDeleteAvailability,
  onBookingAction,
}: CalendarAgendaProps) {
  const today = startOfDay(new Date());

  const upcomingEvents = useMemo(() => {
    const start = selectedDay ? startOfDay(selectedDay) : today;
    return allEvents
      .filter((e) => e.type === 'booking' && isAfter(parseISO(e.start), start) && !isSameDay(parseISO(e.start), start))
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
      .slice(0, 5);
  }, [allEvents, selectedDay, today]);

  const sortedDayEvents = useMemo(
    () => [...selectedDayEvents].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime()),
    [selectedDayEvents]
  );

  return (
    <div className="flex-1 min-w-0 space-y-4">
      {/* Selected day header */}
      {selectedDay && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-stone-900">
              {formatDateHeader(selectedDay)}
            </h2>
            <span className="text-xs text-stone-400">
              {sortedDayEvents.length} {sortedDayEvents.length === 1 ? 'event' : 'events'}
            </span>
          </div>

          {/* Day's events */}
          {sortedDayEvents.length > 0 ? (
            <div className="space-y-2">
              {sortedDayEvents.map((event) => (
                <EventCard
                  key={`${event.type}-${event.id}`}
                  event={event}
                  onBookingAction={onBookingAction}
                  onDeleteAvailability={onDeleteAvailability}
                />
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-stone-200 p-6 text-center">
              <p className="text-sm text-stone-500 mb-3">No events scheduled</p>
              <button
                type="button"
                onClick={() => onAddAvailability(selectedDay)}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-600 hover:text-emerald-700"
              >
                <Plus size={14} />
                Add availability for this day
              </button>
            </div>
          )}

          {/* Add availability for selected day */}
          {sortedDayEvents.length > 0 && (
            <button
              type="button"
              onClick={() => onAddAvailability(selectedDay)}
              className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-emerald-600 border border-dashed border-emerald-300 rounded-xl hover:bg-emerald-50 transition-colors"
            >
              <Plus size={14} />
              Add Availability
            </button>
          )}
        </>
      )}

      {/* No day selected */}
      {!selectedDay && (
        <div className="bg-white rounded-xl border border-stone-200 p-6 text-center">
          <p className="text-sm text-stone-500">Select a day to see details</p>
        </div>
      )}

      {/* Upcoming section */}
      {upcomingEvents.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-stone-700 mb-3">Coming Up</h3>
          <div className="space-y-2">
            {upcomingEvents.map((event) => {
              const eventDate = parseISO(event.start);
              return (
                <div
                  key={`upcoming-${event.id}`}
                  className="bg-white rounded-xl border border-stone-200 p-3 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="text-center w-10 shrink-0">
                      <div className="text-[10px] text-stone-400 uppercase">{format(eventDate, 'MMM')}</div>
                      <div className="text-lg font-bold text-stone-900 leading-tight">{format(eventDate, 'd')}</div>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-stone-900 truncate">{event.title}</p>
                      <p className="text-xs text-stone-500 truncate">
                        {event.owner_name && `${event.owner_name} · `}
                        {formatTimeRange(event.start, event.end)}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {event.status && <StatusBadge status={event.status} />}
                    {event.status === 'pending' && (
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => onBookingAction(event.id, 'confirm')}
                          className="text-[10px] px-2 py-1 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition-colors"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          onClick={() => onBookingAction(event.id, 'cancel')}
                          className="text-[10px] px-2 py-1 bg-white text-red-600 border border-red-200 rounded-lg font-medium hover:bg-red-50 transition-colors"
                        >
                          Decline
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
