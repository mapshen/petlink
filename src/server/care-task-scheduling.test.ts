import { describe, it, expect } from 'vitest';
import { parseTimeToScheduled } from './routes/bookings.ts';

describe('parseTimeToScheduled', () => {
  const bookingDate = new Date('2026-03-30T09:00:00.000Z');

  describe('HH:MM format (24-hour)', () => {
    it('parses "14:00"', () => {
      const result = parseTimeToScheduled(bookingDate, '14:00');
      expect(result).not.toBeNull();
      expect(result!.getHours()).toBe(14);
      expect(result!.getMinutes()).toBe(0);
    });

    it('parses "08:30"', () => {
      const result = parseTimeToScheduled(bookingDate, '08:30');
      expect(result).not.toBeNull();
      expect(result!.getHours()).toBe(8);
      expect(result!.getMinutes()).toBe(30);
    });

    it('parses "0:00" (midnight)', () => {
      const result = parseTimeToScheduled(bookingDate, '0:00');
      expect(result).not.toBeNull();
      expect(result!.getHours()).toBe(0);
      expect(result!.getMinutes()).toBe(0);
    });

    it('parses "23:59"', () => {
      const result = parseTimeToScheduled(bookingDate, '23:59');
      expect(result).not.toBeNull();
      expect(result!.getHours()).toBe(23);
      expect(result!.getMinutes()).toBe(59);
    });
  });

  describe('12-hour format (AM/PM)', () => {
    it('parses "2:00 PM"', () => {
      const result = parseTimeToScheduled(bookingDate, '2:00 PM');
      expect(result).not.toBeNull();
      expect(result!.getHours()).toBe(14);
      expect(result!.getMinutes()).toBe(0);
    });

    it('parses "8:30 am"', () => {
      const result = parseTimeToScheduled(bookingDate, '8:30 am');
      expect(result).not.toBeNull();
      expect(result!.getHours()).toBe(8);
      expect(result!.getMinutes()).toBe(30);
    });

    it('parses "12:00 PM" as noon', () => {
      const result = parseTimeToScheduled(bookingDate, '12:00 PM');
      expect(result).not.toBeNull();
      expect(result!.getHours()).toBe(12);
    });

    it('parses "12:00 AM" as midnight', () => {
      const result = parseTimeToScheduled(bookingDate, '12:00 AM');
      expect(result).not.toBeNull();
      expect(result!.getHours()).toBe(0);
    });

    it('handles lowercase "pm"', () => {
      const result = parseTimeToScheduled(bookingDate, '6:00 pm');
      expect(result).not.toBeNull();
      expect(result!.getHours()).toBe(18);
    });
  });

  describe('edge cases', () => {
    it('returns null for empty string', () => {
      expect(parseTimeToScheduled(bookingDate, '')).toBeNull();
    });

    it('returns null for unparseable format', () => {
      expect(parseTimeToScheduled(bookingDate, 'morning')).toBeNull();
      expect(parseTimeToScheduled(bookingDate, 'around 2pm')).toBeNull();
    });

    it('trims whitespace', () => {
      const result = parseTimeToScheduled(bookingDate, '  14:00  ');
      expect(result).not.toBeNull();
      expect(result!.getHours()).toBe(14);
    });

    it('preserves the date from bookingDate', () => {
      const result = parseTimeToScheduled(bookingDate, '14:00');
      expect(result).not.toBeNull();
      expect(result!.getDate()).toBe(bookingDate.getDate());
      expect(result!.getMonth()).toBe(bookingDate.getMonth());
      expect(result!.getFullYear()).toBe(bookingDate.getFullYear());
    });
  });
});
