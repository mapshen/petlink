import { describe, it, expect } from 'vitest';
import { Availability } from '../types';

// Extract and test the pure time slot generation logic from TimeSlotPicker
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

function generateTimeSlots(
  selectedDate: Date,
  availability: Availability[]
): string[] {
  const dayOfWeek = selectedDate.getDay();
  const year = selectedDate.getFullYear();
  const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
  const day = String(selectedDate.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;

  const windows = availability.filter((a) => {
    if (a.specific_date === dateStr) return true;
    if (a.recurring && a.day_of_week === dayOfWeek) return true;
    return false;
  });

  if (availability.length === 0) {
    const slots: string[] = [];
    for (let h = 8; h < 18; h++) {
      slots.push(to24h(h, 0));
    }
    return slots;
  }

  if (windows.length === 0) return [];

  const slotSet = new Set<string>();
  for (const win of windows) {
    const start = parseTime(win.start_time);
    const end = parseTime(win.end_time);
    let h = start.hours;
    let m = start.minutes;
    if (m > 0) {
      h += 1;
      m = 0;
    }
    while (h < end.hours || (h === end.hours && m < end.minutes)) {
      slotSet.add(to24h(h, m));
      h += 1;
    }
  }

  return [...slotSet].sort();
}

describe('TimeSlotPicker: parseTime', () => {
  it('parses HH:mm correctly', () => {
    expect(parseTime('09:30')).toEqual({ hours: 9, minutes: 30 });
    expect(parseTime('14:00')).toEqual({ hours: 14, minutes: 0 });
  });

  it('parses HH:mm:ss correctly', () => {
    expect(parseTime('08:00:00')).toEqual({ hours: 8, minutes: 0 });
  });
});

describe('TimeSlotPicker: formatSlotTime', () => {
  it('formats AM times', () => {
    expect(formatSlotTime(9, 0)).toBe('9:00 AM');
    expect(formatSlotTime(11, 30)).toBe('11:30 AM');
  });

  it('formats PM times', () => {
    expect(formatSlotTime(14, 0)).toBe('2:00 PM');
    expect(formatSlotTime(17, 30)).toBe('5:30 PM');
  });

  it('formats noon as 12 PM', () => {
    expect(formatSlotTime(12, 0)).toBe('12:00 PM');
  });

  it('formats midnight as 12 AM', () => {
    expect(formatSlotTime(0, 0)).toBe('12:00 AM');
  });
});

describe('TimeSlotPicker: generateTimeSlots', () => {
  // Monday March 2, 2026
  const monday = new Date(2026, 2, 2);

  it('returns default 8am-5pm when no availability set', () => {
    const slots = generateTimeSlots(monday, []);
    expect(slots).toHaveLength(10);
    expect(slots[0]).toBe('08:00');
    expect(slots[slots.length - 1]).toBe('17:00');
  });

  it('returns slots for matching recurring availability', () => {
    const avail: Availability[] = [{
      id: 1, sitter_id: 1, recurring: true, day_of_week: 1, // Monday
      start_time: '09:00:00', end_time: '12:00:00',
    }];
    const slots = generateTimeSlots(monday, avail);
    expect(slots).toEqual(['09:00', '10:00', '11:00']);
  });

  it('returns slots for matching specific date', () => {
    const avail: Availability[] = [{
      id: 1, sitter_id: 1, recurring: false, specific_date: '2026-03-02',
      start_time: '14:00:00', end_time: '17:00:00',
    }];
    const slots = generateTimeSlots(monday, avail);
    expect(slots).toEqual(['14:00', '15:00', '16:00']);
  });

  it('returns empty when no matching windows', () => {
    const avail: Availability[] = [{
      id: 1, sitter_id: 1, recurring: true, day_of_week: 3, // Wednesday, not Monday
      start_time: '09:00:00', end_time: '12:00:00',
    }];
    const slots = generateTimeSlots(monday, avail);
    expect(slots).toEqual([]);
  });

  it('merges overlapping windows', () => {
    const avail: Availability[] = [
      { id: 1, sitter_id: 1, recurring: true, day_of_week: 1, start_time: '09:00:00', end_time: '12:00:00' },
      { id: 2, sitter_id: 1, recurring: true, day_of_week: 1, start_time: '11:00:00', end_time: '14:00:00' },
    ];
    const slots = generateTimeSlots(monday, avail);
    expect(slots).toEqual(['09:00', '10:00', '11:00', '12:00', '13:00']);
  });

  it('rounds up non-hour start times', () => {
    const avail: Availability[] = [{
      id: 1, sitter_id: 1, recurring: true, day_of_week: 1,
      start_time: '09:30:00', end_time: '12:00:00',
    }];
    const slots = generateTimeSlots(monday, avail);
    expect(slots).toEqual(['10:00', '11:00']);
  });
});
