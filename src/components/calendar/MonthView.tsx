import React, { useMemo } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameMonth,
  isSameDay,
  isAfter,
  startOfDay,
} from 'date-fns';
import { CalendarEvent } from '../../types';

interface MonthViewProps {
  currentDate: Date;
  eventsByDate: Map<string, CalendarEvent[]>;
  selectedDay: Date | null;
  onDaySelect: (date: Date) => void;
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getEventColor(event: CalendarEvent): string {
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
      return 'bg-red-100 text-red-600 line-through';
    default:
      return 'bg-stone-100 text-stone-600';
  }
}

export default function MonthView({
  currentDate,
  eventsByDate,
  selectedDay,
  onDaySelect,
}: MonthViewProps) {
  const today = startOfDay(new Date());

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calStart = startOfWeek(monthStart);
    const calEnd = endOfWeek(monthEnd);

    const days: Date[] = [];
    let day = calStart;
    while (!isAfter(day, calEnd)) {
      days.push(day);
      day = addDays(day, 1);
    }
    return days;
  }, [currentDate]);

  return (
    <div className="select-none">
      {/* Day Headers */}
      <div className="grid grid-cols-7 mb-1 border-b border-stone-100 pb-2">
        {DAYS_OF_WEEK.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-stone-400 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-px bg-stone-100">
        {calendarDays.map((day) => {
          const inMonth = isSameMonth(day, currentDate);
          const isToday = isSameDay(day, today);
          const isSelected = selectedDay !== null && isSameDay(day, selectedDay);
          const dateKey = format(day, 'yyyy-MM-dd');
          const events = eventsByDate.get(dateKey) ?? [];
          const visibleEvents = events.slice(0, 2);
          const overflowCount = events.length - visibleEvents.length;

          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onDaySelect(day)}
              className={`
                min-h-[80px] p-1.5 flex flex-col gap-0.5 text-left transition-colors bg-white
                ${inMonth ? 'hover:bg-emerald-50 cursor-pointer' : 'cursor-pointer'}
                ${isSelected ? 'bg-emerald-600 hover:bg-emerald-600' : ''}
              `}
            >
              {/* Date Number */}
              <span
                className={`
                  inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-medium mb-0.5 shrink-0
                  ${!inMonth ? 'text-stone-300' : ''}
                  ${inMonth && !isSelected && !isToday ? 'text-stone-700' : ''}
                  ${isToday && !isSelected ? 'ring-1 ring-emerald-400 font-bold text-stone-900' : ''}
                  ${isSelected ? 'bg-white text-emerald-700 font-bold' : ''}
                `}
              >
                {format(day, 'd')}
              </span>

              {/* Event Pills */}
              {inMonth && visibleEvents.map((event) => (
                <span
                  key={event.id}
                  className={`
                    block truncate rounded px-1 text-[10px] leading-4 max-w-full
                    ${isSelected ? 'bg-emerald-500 text-white border-transparent' : getEventColor(event)}
                  `}
                  title={event.title}
                >
                  {event.title}
                </span>
              ))}

              {/* Overflow Count */}
              {inMonth && overflowCount > 0 && (
                <span
                  className={`text-[10px] leading-4 px-1 ${isSelected ? 'text-emerald-100' : 'text-stone-400'}`}
                >
                  +{overflowCount} more
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
