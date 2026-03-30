import { describe, it, expect } from 'vitest';
import { parseTimeToScheduled } from './routes/bookings.ts';

describe('parseTimeToScheduled', () => {
  const bookingDate = new Date('2026-03-30T09:00:00.000Z');

  describe('HH:MM format (24-hour)', () => {
    it('parses "14:00"', () => {
      const result = parseTimeToScheduled(bookingDate, '14:00');
      expect(result).not.toBeNull();
      expect(result!.getUTCHours()).toBe(14);
      expect(result!.getUTCMinutes()).toBe(0);
    });

    it('parses "08:30"', () => {
      const result = parseTimeToScheduled(bookingDate, '08:30');
      expect(result).not.toBeNull();
      expect(result!.getUTCHours()).toBe(8);
      expect(result!.getUTCMinutes()).toBe(30);
    });

    it('parses "0:00" (midnight)', () => {
      const result = parseTimeToScheduled(bookingDate, '0:00');
      expect(result).not.toBeNull();
      expect(result!.getUTCHours()).toBe(0);
      expect(result!.getUTCMinutes()).toBe(0);
    });

    it('parses "23:59"', () => {
      const result = parseTimeToScheduled(bookingDate, '23:59');
      expect(result).not.toBeNull();
      expect(result!.getUTCHours()).toBe(23);
      expect(result!.getUTCMinutes()).toBe(59);
    });
  });

  describe('12-hour format (AM/PM)', () => {
    it('parses "2:00 PM"', () => {
      const result = parseTimeToScheduled(bookingDate, '2:00 PM');
      expect(result).not.toBeNull();
      expect(result!.getUTCHours()).toBe(14);
      expect(result!.getUTCMinutes()).toBe(0);
    });

    it('parses "8:30 am"', () => {
      const result = parseTimeToScheduled(bookingDate, '8:30 am');
      expect(result).not.toBeNull();
      expect(result!.getUTCHours()).toBe(8);
      expect(result!.getUTCMinutes()).toBe(30);
    });

    it('parses "12:00 PM" as noon', () => {
      const result = parseTimeToScheduled(bookingDate, '12:00 PM');
      expect(result).not.toBeNull();
      expect(result!.getUTCHours()).toBe(12);
    });

    it('parses "12:00 AM" as midnight', () => {
      const result = parseTimeToScheduled(bookingDate, '12:00 AM');
      expect(result).not.toBeNull();
      expect(result!.getUTCHours()).toBe(0);
    });

    it('handles lowercase "pm"', () => {
      const result = parseTimeToScheduled(bookingDate, '6:00 pm');
      expect(result).not.toBeNull();
      expect(result!.getUTCHours()).toBe(18);
    });
  });

  describe('range validation', () => {
    it('rejects hours > 23 in 24h format', () => {
      expect(parseTimeToScheduled(bookingDate, '25:00')).toBeNull();
      expect(parseTimeToScheduled(bookingDate, '24:00')).toBeNull();
    });

    it('rejects minutes > 59 in 24h format', () => {
      expect(parseTimeToScheduled(bookingDate, '14:60')).toBeNull();
      expect(parseTimeToScheduled(bookingDate, '8:99')).toBeNull();
    });

    it('rejects hours > 12 in 12h format', () => {
      expect(parseTimeToScheduled(bookingDate, '13:00 PM')).toBeNull();
    });

    it('rejects hours < 1 in 12h format', () => {
      expect(parseTimeToScheduled(bookingDate, '0:00 AM')).toBeNull();
    });

    it('rejects minutes > 59 in 12h format', () => {
      expect(parseTimeToScheduled(bookingDate, '2:60 PM')).toBeNull();
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
      expect(result!.getUTCHours()).toBe(14);
    });

    it('preserves the UTC date from bookingDate', () => {
      const result = parseTimeToScheduled(bookingDate, '14:00');
      expect(result).not.toBeNull();
      expect(result!.getUTCDate()).toBe(bookingDate.getUTCDate());
      expect(result!.getUTCMonth()).toBe(bookingDate.getUTCMonth());
      expect(result!.getUTCFullYear()).toBe(bookingDate.getUTCFullYear());
    });
  });
});
