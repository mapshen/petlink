import React, { useMemo } from 'react';
import { CalendarDays } from 'lucide-react';
import {
  format,
  isToday,
  isTomorrow,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
} from 'date-fns';
import { CalendarEvent } from '../../types';

interface ListViewProps {
  currentDate: Date;
  eventsByDate: Map<string, CalendarEvent[]>;
  onDaySelect: (date: Date) => void;
}

function getStatusBadgeClass(event: CalendarEvent): string {
  if (event.type === 'availability') {
    return 'bg-emerald-50 text-emerald-600 border border-dashed border-emerald-300';
  }
  switch (event.status) {
    case 'confirmed':
      return 'bg-emerald-100 text-emerald-700';
    case 'pending':
      return 'bg-amber-100 text-amber-700';
    case 'in_progress':
      return 'bg-blue-100 text-blue-700';
    case 'completed':
      return 'bg-stone-100 text-stone-600';
    case 'cancelled':
      return 'bg-red-100 text-red-600';
    default:
      return 'bg-stone-100 text-stone-600';
  }
}

function getStatusLabel(event: CalendarEvent): string {
  if (event.type === 'availability') return 'Available';
  if (!event.status) return 'Booking';
  return event.status.charAt(0).toUpperCase() + event.status.slice(1).replace('_', ' ');
}

function formatDateHeader(date: Date): string {
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  return format(date, 'EEEE, MMMM d');
}

function formatTimeRange(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return `${format(startDate, 'h:mm a')} – ${format(endDate, 'h:mm a')}`;
}

interface EventCardProps {
  event: CalendarEvent;
}

function EventCard({ event }: EventCardProps) {
  const timeRange = formatTimeRange(event.start, event.end);
  const statusLabel = getStatusLabel(event);
  const badgeClass = getStatusBadgeClass(event);
  const isCancelled = event.status === 'cancelled';

  return (
    <div className="rounded-xl shadow-sm border border-stone-100 bg-white p-3 flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badgeClass}`}
        >
          {statusLabel}
        </span>
        <span className="text-xs text-stone-400 shrink-0">{timeRange}</span>
      </div>

      <p className={`text-sm font-medium text-stone-800 ${isCancelled ? 'line-through text-stone-400' : ''}`}>
        {event.title}
      </p>

      {event.pet_names && event.pet_names.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {event.pet_names.map((name) => (
            <span
              key={name}
              className="inline-flex items-center rounded-full bg-stone-100 px-2 py-0.5 text-[10px] text-stone-600"
            >
              {name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ListView({
  currentDate,
  eventsByDate,
  onDaySelect,
}: ListViewProps) {
  const daysWithEvents = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

    return allDays
      .map((day) => {
        const dateKey = format(day, 'yyyy-MM-dd');
        const events = eventsByDate.get(dateKey) ?? [];
        return { day, events };
      })
      .filter(({ events }) => events.length > 0);
  }, [currentDate, eventsByDate]);

  if (daysWithEvents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-stone-400">
        <CalendarDays className="w-10 h-10 opacity-40" />
        <p className="text-sm">No events this period</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {daysWithEvents.map(({ day, events }) => {
        const dateKey = format(day, 'yyyy-MM-dd');
        return (
          <section key={dateKey}>
            {/* Sticky Date Header */}
            <button
              type="button"
              onClick={() => onDaySelect(day)}
              className="sticky top-0 z-10 w-full text-left bg-stone-50 border-b border-stone-200 px-1 py-1.5 mb-2 hover:bg-emerald-50 transition-colors"
            >
              <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wide">
                {formatDateHeader(day)}
              </h3>
            </button>

            {/* Event Cards */}
            <div className="flex flex-col gap-2">
              {events.map((event) => (
                <EventCard key={`${event.type}-${event.id}`} event={event} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
