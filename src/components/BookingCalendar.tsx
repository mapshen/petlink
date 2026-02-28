import React, { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Availability } from '../types';
import { API_BASE } from '../config';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameMonth, isSameDay, isAfter, isBefore, startOfDay } from 'date-fns';

interface BookingCalendarProps {
  sitterId: number;
  selectedDate: Date | null;
  onDateSelect: (date: Date) => void;
  onAvailabilityLoaded?: (availability: Availability[]) => void;
}

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function BookingCalendar({ sitterId, selectedDate, onDateSelect, onAvailabilityLoaded }: BookingCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAvailability = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/availability/${sitterId}`);
        if (res.ok) {
          const data = await res.json();
          setAvailability(data.availability);
          onAvailabilityLoaded?.(data.availability);
        }
      } catch {
        // Availability fetch failure is non-fatal — show all dates as available
      } finally {
        setLoading(false);
      }
    };
    fetchAvailability();
  }, [sitterId]);

  const today = startOfDay(new Date());

  const availableDaysOfWeek = useMemo(() => {
    const recurring = availability.filter((a) => a.recurring && a.day_of_week != null);
    return new Set(recurring.map((a) => a.day_of_week));
  }, [availability]);

  const specificDates = useMemo(() => {
    return availability
      .filter((a) => a.specific_date)
      .map((a) => a.specific_date!);
  }, [availability]);

  const isDateAvailable = (date: Date): boolean => {
    if (isBefore(date, today)) return false;
    // If no availability is set, treat all future dates as available
    if (availability.length === 0) return true;
    // Check specific dates
    const dateStr = format(date, 'yyyy-MM-dd');
    if (specificDates.includes(dateStr)) return true;
    // Check recurring day-of-week
    if (availableDaysOfWeek.has(date.getDay())) return true;
    return false;
  };

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calStart = startOfWeek(monthStart);
    const calEnd = endOfWeek(monthEnd);

    const days: Date[] = [];
    let day = calStart;
    while (!isAfter(day, calEnd)) {
      days.push(day);
      day = addDays(day, 1);
    }
    return days;
  }, [currentMonth]);

  return (
    <div className="select-none">
      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
          className="p-1 rounded-lg hover:bg-stone-100 text-stone-500 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h4 className="text-sm font-bold text-stone-900">
          {format(currentMonth, 'MMMM yyyy')}
        </h4>
        <button
          type="button"
          onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
          className="p-1 rounded-lg hover:bg-stone-100 text-stone-500 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Day Headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAYS_OF_WEEK.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-stone-400 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-0.5">
          {calendarDays.map((day) => {
            const inMonth = isSameMonth(day, currentMonth);
            const available = inMonth && isDateAvailable(day);
            const isSelected = selectedDate && isSameDay(day, selectedDate);
            const isToday = isSameDay(day, today);

            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => available && onDateSelect(day)}
                disabled={!available}
                className={`
                  aspect-square flex items-center justify-center text-xs rounded-lg transition-colors
                  ${!inMonth ? 'text-stone-200' : ''}
                  ${inMonth && !available ? 'text-stone-300 cursor-not-allowed' : ''}
                  ${inMonth && available && !isSelected ? 'text-stone-700 hover:bg-emerald-50 hover:text-emerald-700 cursor-pointer' : ''}
                  ${isSelected ? 'bg-emerald-600 text-white font-bold' : ''}
                  ${isToday && !isSelected ? 'ring-1 ring-emerald-400 font-medium' : ''}
                `}
              >
                {format(day, 'd')}
              </button>
            );
          })}
        </div>
      )}

      {/* Legend */}
      <div className="mt-3 flex items-center gap-4 text-xs text-stone-400">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-emerald-600"></div>
          <span>Selected</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded ring-1 ring-emerald-400"></div>
          <span>Today</span>
        </div>
      </div>
    </div>
  );
}
