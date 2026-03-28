import React, { useMemo } from 'react';
import {
  format,
  startOfWeek,
  addDays,
  isSameDay,
  startOfDay,
} from 'date-fns';
import { CalendarEvent } from '../../types';

interface WeekViewProps {
  currentDate: Date;
  eventsByDate: Map<string, CalendarEvent[]>;
  selectedDay: Date | null;
  onDaySelect: (date: Date) => void;
}

const START_HOUR = 6;
const END_HOUR = 22; // 10 PM
const HOUR_HEIGHT = 60; // px

const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

function getEventPosition(event: CalendarEvent): { top: number; height: number } {
  const start = new Date(event.start);
  const end = new Date(event.end);
  const startHour = start.getHours() + start.getMinutes() / 60;
  const endHour = end.getHours() + end.getMinutes() / 60;
  return {
    top: (startHour - START_HOUR) * HOUR_HEIGHT,
    height: Math.max((endHour - startHour) * HOUR_HEIGHT, 20),
  };
}

function getEventBgColor(event: CalendarEvent): string {
  if (event.type === 'availability') return 'bg-emerald-50 border border-dashed border-emerald-300';
  switch (event.status) {
    case 'confirmed': return 'bg-emerald-100 border-l-4 border-emerald-500';
    case 'pending': return 'bg-amber-100 border-l-4 border-amber-500';
    case 'in_progress': return 'bg-blue-100 border-l-4 border-blue-500';
    case 'completed': return 'bg-stone-100 border-l-4 border-stone-400';
    case 'cancelled': return 'bg-red-50 border-l-4 border-red-400';
    default: return 'bg-stone-100';
  }
}

function getEventTextColor(event: CalendarEvent): string {
  if (event.type === 'availability') return 'text-emerald-600';
  switch (event.status) {
    case 'confirmed': return 'text-emerald-700';
    case 'pending': return 'text-amber-700';
    case 'in_progress': return 'text-blue-700';
    case 'completed': return 'text-stone-600';
    case 'cancelled': return 'text-red-500';
    default: return 'text-stone-600';
  }
}

function formatHourLabel(hour: number): string {
  if (hour === 12) return '12 PM';
  if (hour < 12) return `${hour} AM`;
  return `${hour - 12} PM`;
}

export default function WeekView({
  currentDate,
  eventsByDate,
  selectedDay,
  onDaySelect,
}: WeekViewProps) {
  const today = startOfDay(new Date());

  const weekDays = useMemo(() => {
    const weekStart = startOfWeek(currentDate);
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [currentDate]);

  const gridHeight = HOURS.length * HOUR_HEIGHT;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px]">
        {/* Day Headers */}
        <div className="flex border-b border-stone-200 sticky top-0 bg-white z-10">
          {/* Time gutter */}
          <div className="w-14 shrink-0" />
          {weekDays.map((day) => {
            const isToday = isSameDay(day, today);
            const isSelected = selectedDay !== null && isSameDay(day, selectedDay);
            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => onDaySelect(day)}
                className="flex-1 text-center py-2 cursor-pointer hover:bg-emerald-50 transition-colors"
              >
                <div className="text-xs text-stone-400 font-medium uppercase tracking-wide">
                  {format(day, 'EEE')}
                </div>
                <div
                  className={`
                    mx-auto mt-0.5 w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold
                    ${isToday && !isSelected ? 'ring-2 ring-emerald-400 text-stone-900' : ''}
                    ${isSelected ? 'bg-emerald-600 text-white' : 'text-stone-700'}
                  `}
                >
                  {format(day, 'd')}
                </div>
              </button>
            );
          })}
        </div>

        {/* Time Grid */}
        <div className="flex" style={{ height: gridHeight }}>
          {/* Time Labels */}
          <div className="w-14 shrink-0 relative">
            {HOURS.map((hour) => (
              <div
                key={hour}
                className="absolute w-full pr-2 flex items-start justify-end"
                style={{ top: (hour - START_HOUR) * HOUR_HEIGHT - 8, height: HOUR_HEIGHT }}
              >
                <span className="text-[10px] text-stone-400 leading-4 mt-1 select-none">
                  {formatHourLabel(hour)}
                </span>
              </div>
            ))}
          </div>

          {/* Day Columns */}
          {weekDays.map((day) => {
            const dateKey = format(day, 'yyyy-MM-dd');
            const events = eventsByDate.get(dateKey) ?? [];
            const availabilityEvents = events.filter((e) => e.type === 'availability');
            const bookingEvents = events.filter((e) => e.type === 'booking');

            return (
              <div
                key={day.toISOString()}
                className="flex-1 relative border-l border-stone-100 cursor-pointer hover:bg-stone-50/50 transition-colors"
                onClick={() => onDaySelect(day)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onDaySelect(day);
                }}
                aria-label={`Select ${format(day, 'EEEE, MMMM d')}`}
              >
                {/* Hour lines */}
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    className="absolute left-0 right-0 border-t border-stone-100"
                    style={{ top: (hour - START_HOUR) * HOUR_HEIGHT }}
                  />
                ))}

                {/* Availability bands (semi-transparent background) */}
                {availabilityEvents.map((event) => {
                  const { top, height } = getEventPosition(event);
                  return (
                    <div
                      key={`avail-${event.id}`}
                      className="absolute left-0 right-0 bg-emerald-50/70 border-y border-dashed border-emerald-200 pointer-events-none"
                      style={{ top, height }}
                    />
                  );
                })}

                {/* Booking event blocks */}
                {bookingEvents.map((event) => {
                  const { top, height } = getEventPosition(event);
                  return (
                    <div
                      key={`booking-${event.id}`}
                      className={`
                        absolute left-0.5 right-0.5 rounded overflow-hidden px-1 py-0.5
                        ${getEventBgColor(event)}
                      `}
                      style={{ top: top + 1, height: height - 2, zIndex: 1 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onDaySelect(day);
                      }}
                    >
                      <p className={`text-[10px] font-medium leading-tight truncate ${getEventTextColor(event)}`}>
                        {event.title}
                      </p>
                      {height >= 36 && (
                        <p className="text-[10px] leading-tight text-stone-500 truncate">
                          {format(new Date(event.start), 'h:mm a')}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
