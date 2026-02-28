import React, { useMemo } from 'react';
import { Clock } from 'lucide-react';
import { Availability } from '../types';
import { format } from 'date-fns';

interface TimeSlotPickerProps {
  selectedDate: Date;
  availability: Availability[];
  selectedTime: string | null;
  onTimeSelect: (time: string) => void;
}

function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [h, m] = timeStr.split(':').map(Number);
  return { hours: h, minutes: m };
}

function formatSlotTime(hours: number, minutes: number): string {
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`;
}

function to24h(hours: number, minutes: number): string {
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export default function TimeSlotPicker({ selectedDate, availability, selectedTime, onTimeSelect }: TimeSlotPickerProps) {
  const timeSlots = useMemo(() => {
    const dayOfWeek = selectedDate.getDay();
    const dateStr = format(selectedDate, 'yyyy-MM-dd');

    // Find matching availability windows
    const windows = availability.filter((a) => {
      if (a.specific_date === dateStr) return true;
      if (a.recurring && a.day_of_week === dayOfWeek) return true;
      return false;
    });

    // If no availability configured, offer default 8am-6pm slots
    if (availability.length === 0) {
      const slots: string[] = [];
      for (let h = 8; h < 18; h++) {
        slots.push(to24h(h, 0));
      }
      return slots;
    }

    if (windows.length === 0) return [];

    // Generate 1-hour slots within each window
    const slotSet = new Set<string>();
    for (const win of windows) {
      const start = parseTime(win.start_time);
      const end = parseTime(win.end_time);
      let h = start.hours;
      let m = start.minutes;
      // Round up to nearest hour if minutes > 0
      if (m > 0) {
        h += 1;
        m = 0;
      }
      const MAX_SLOTS = 24;
      let count = 0;
      while ((h < end.hours || (h === end.hours && m < end.minutes)) && count < MAX_SLOTS) {
        slotSet.add(to24h(h, m));
        h += 1;
        count += 1;
      }
    }

    const sorted = [...slotSet].sort();

    // Filter out past slots when the selected date is today
    const now = new Date();
    const isToday = selectedDate.toDateString() === now.toDateString();
    if (isToday) {
      const currentHour = now.getHours();
      return sorted.filter((slot) => {
        const { hours } = parseTime(slot);
        return hours > currentHour;
      });
    }

    return sorted;
  }, [selectedDate, availability]);

  if (timeSlots.length === 0) {
    return (
      <div className="text-center py-4 text-sm text-stone-400">
        No available time slots for this date.
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-4 h-4 text-stone-400" />
        <span className="text-sm font-medium text-stone-700">
          {format(selectedDate, 'EEE, MMM d')}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {timeSlots.map((slot) => {
          const { hours, minutes } = parseTime(slot);
          const isSelected = selectedTime === slot;
          return (
            <button
              key={slot}
              type="button"
              onClick={() => onTimeSelect(slot)}
              className={`
                py-2 px-1 text-xs rounded-lg border transition-colors
                ${isSelected
                  ? 'bg-emerald-600 text-white border-emerald-600 font-bold'
                  : 'border-stone-200 text-stone-600 hover:border-emerald-300 hover:bg-emerald-50'}
              `}
            >
              {formatSlotTime(hours, minutes)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
