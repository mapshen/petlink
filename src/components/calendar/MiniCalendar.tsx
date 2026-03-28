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
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CalendarEvent } from '../../types';

interface MiniCalendarProps {
  currentDate: Date;
  eventsByDate: Map<string, CalendarEvent[]>;
  selectedDay: Date | null;
  onDaySelect: (date: Date) => void;
  onPrev: () => void;
  onNext: () => void;
}

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function getDotColors(events: CalendarEvent[]): string[] {
  const colors = new Set<string>();
  for (const e of events) {
    if (e.type === 'availability') {
      colors.add('bg-emerald-300');
    } else {
      switch (e.status) {
        case 'confirmed': colors.add('bg-emerald-500'); break;
        case 'pending': colors.add('bg-amber-500'); break;
        case 'in_progress': colors.add('bg-blue-500'); break;
        case 'completed': colors.add('bg-stone-400'); break;
        case 'cancelled': colors.add('bg-red-400'); break;
        default: colors.add('bg-stone-400');
      }
    }
  }
  return [...colors].slice(0, 3);
}

export default function MiniCalendar({
  currentDate,
  eventsByDate,
  selectedDay,
  onDaySelect,
  onPrev,
  onNext,
}: MiniCalendarProps) {
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
    <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={onPrev}
          className="p-1.5 rounded-lg text-stone-400 hover:bg-stone-100 transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold text-stone-900">
          {format(currentDate, 'MMMM yyyy')}
        </span>
        <button
          type="button"
          onClick={onNext}
          className="p-1.5 rounded-lg text-stone-400 hover:bg-stone-100 transition-colors"
          aria-label="Next month"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 text-center mb-1">
        {DAYS.map((d) => (
          <div key={d} className="text-[10px] font-medium text-stone-400 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-0.5">
        {calendarDays.map((day) => {
          const inMonth = isSameMonth(day, currentDate);
          const isToday = isSameDay(day, today);
          const isSelected = selectedDay !== null && isSameDay(day, selectedDay);
          const dateKey = format(day, 'yyyy-MM-dd');
          const events = eventsByDate.get(dateKey) ?? [];
          const dots = inMonth ? getDotColors(events) : [];

          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onDaySelect(day)}
              className={`
                relative flex flex-col items-center py-1.5 rounded-lg transition-colors
                ${inMonth ? 'hover:bg-emerald-50 cursor-pointer' : 'cursor-pointer opacity-30'}
                ${isSelected ? 'bg-emerald-100 ring-2 ring-emerald-500' : ''}
              `}
              aria-label={format(day, 'EEEE, MMMM d')}
              aria-pressed={isSelected}
            >
              <span
                className={`
                  text-xs leading-none font-medium
                  ${isSelected ? 'text-emerald-700 font-bold' : ''}
                  ${isToday && !isSelected ? 'text-emerald-600 font-bold' : ''}
                  ${!isToday && !isSelected && inMonth ? 'text-stone-900' : ''}
                  ${!inMonth ? 'text-stone-300' : ''}
                `}
              >
                {format(day, 'd')}
              </span>
              {dots.length > 0 && (
                <div className="flex gap-0.5 mt-0.5">
                  {dots.map((color, i) => (
                    <div key={i} className={`w-1 h-1 rounded-full ${color}`} />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 pt-3 border-t border-stone-100 flex flex-wrap gap-x-3 gap-y-1">
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          <span className="text-[10px] text-stone-500">Confirmed</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          <span className="text-[10px] text-stone-500">Pending</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          <span className="text-[10px] text-stone-500">Active</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-300" />
          <span className="text-[10px] text-stone-500">Available</span>
        </div>
      </div>
    </div>
  );
}
