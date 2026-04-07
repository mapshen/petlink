import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSqlFn } = vi.hoisted(() => {
  const sqlFn = vi.fn();
  return { mockSqlFn: sqlFn };
});
vi.mock('./db.ts', () => ({ default: mockSqlFn }));

vi.mock('./logger.ts', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  sanitizeError: (e: unknown) => e,
}));

import { maskPhoneNumber, getBookingContact } from './phone-relay.ts';

describe('phone relay', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('maskPhoneNumber', () => {
    it('masks a standard 10-digit phone number', () => {
      expect(maskPhoneNumber('5551234567')).toBe('***-***-4567');
    });

    it('masks a phone with country code prefix', () => {
      expect(maskPhoneNumber('+15551234567')).toBe('***-***-4567');
    });

    it('masks a formatted phone number', () => {
      expect(maskPhoneNumber('(555) 123-4567')).toBe('***-***-4567');
    });

    it('returns null for null/undefined input', () => {
      expect(maskPhoneNumber(null)).toBeNull();
      expect(maskPhoneNumber(undefined)).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(maskPhoneNumber('')).toBeNull();
    });

    it('masks a short number showing last 4', () => {
      expect(maskPhoneNumber('1234567')).toBe('***-4567');
    });

    it('returns as-is for very short numbers (4 or fewer digits)', () => {
      expect(maskPhoneNumber('1234')).toBe('1234');
    });
  });

  describe('getBookingContact', () => {
    it('returns contact info for the other party when booking is confirmed', async () => {
      const booking = {
        id: 1,
        owner_id: 10,
        sitter_id: 20,
        status: 'confirmed',
      };
      const sitter = {
        id: 20,
        name: 'Bob Sitter',
        avatar_url: 'https://example.com/bob.jpg',
        phone: '5551234567',
        share_phone_for_bookings: true,
      };

      mockSqlFn.mockResolvedValueOnce([booking]);
      mockSqlFn.mockResolvedValueOnce([sitter]);

      const result = await getBookingContact(1, 10);
      expect(result).toEqual({
        name: 'Bob',
        avatar_url: 'https://example.com/bob.jpg',
        phone: '5551234567',
        masked_phone: '***-***-4567',
        role: 'sitter',
      });
    });

    it('returns contact info for owner when sitter requests', async () => {
      const booking = {
        id: 1,
        owner_id: 10,
        sitter_id: 20,
        status: 'in_progress',
      };
      const owner = {
        id: 10,
        name: 'Alice Owner',
        avatar_url: 'https://example.com/alice.jpg',
        phone: '5559876543',
        share_phone_for_bookings: true,
      };

      mockSqlFn.mockResolvedValueOnce([booking]);
      mockSqlFn.mockResolvedValueOnce([owner]);

      const result = await getBookingContact(1, 20);
      expect(result).toEqual({
        name: 'Alice',
        avatar_url: 'https://example.com/alice.jpg',
        phone: '5559876543',
        masked_phone: '***-***-6543',
        role: 'owner',
      });
    });

    it('returns null booking when booking not found', async () => {
      mockSqlFn.mockResolvedValueOnce([]);

      const result = await getBookingContact(999, 10);
      expect(result).toEqual({ error: 'not_found' });
    });

    it('returns forbidden when user is not a participant', async () => {
      const booking = {
        id: 1,
        owner_id: 10,
        sitter_id: 20,
        status: 'confirmed',
      };

      mockSqlFn.mockResolvedValueOnce([booking]);

      const result = await getBookingContact(1, 999);
      expect(result).toEqual({ error: 'forbidden' });
    });

    it('returns inactive error for pending bookings', async () => {
      const booking = {
        id: 1,
        owner_id: 10,
        sitter_id: 20,
        status: 'pending',
      };

      mockSqlFn.mockResolvedValueOnce([booking]);

      const result = await getBookingContact(1, 10);
      expect(result).toEqual({ error: 'booking_not_active' });
    });

    it('returns inactive error for completed bookings', async () => {
      const booking = {
        id: 1,
        owner_id: 10,
        sitter_id: 20,
        status: 'completed',
      };

      mockSqlFn.mockResolvedValueOnce([booking]);

      const result = await getBookingContact(1, 10);
      expect(result).toEqual({ error: 'booking_not_active' });
    });

    it('returns inactive error for cancelled bookings', async () => {
      const booking = {
        id: 1,
        owner_id: 10,
        sitter_id: 20,
        status: 'cancelled',
      };

      mockSqlFn.mockResolvedValueOnce([booking]);

      const result = await getBookingContact(1, 10);
      expect(result).toEqual({ error: 'booking_not_active' });
    });

    it('returns phone_not_shared when other party opted out', async () => {
      const booking = {
        id: 1,
        owner_id: 10,
        sitter_id: 20,
        status: 'confirmed',
      };
      const sitter = {
        id: 20,
        name: 'Bob Sitter',
        avatar_url: null,
        phone: '5551234567',
        share_phone_for_bookings: false,
      };

      mockSqlFn.mockResolvedValueOnce([booking]);
      mockSqlFn.mockResolvedValueOnce([sitter]);

      const result = await getBookingContact(1, 10);
      expect(result).toEqual({
        name: 'Bob',
        avatar_url: null,
        phone: null,
        masked_phone: null,
        role: 'sitter',
      });
    });

    it('returns null phone when other party has no phone', async () => {
      const booking = {
        id: 1,
        owner_id: 10,
        sitter_id: 20,
        status: 'confirmed',
      };
      const sitter = {
        id: 20,
        name: 'Bob Sitter',
        avatar_url: null,
        phone: null,
        share_phone_for_bookings: true,
      };

      mockSqlFn.mockResolvedValueOnce([booking]);
      mockSqlFn.mockResolvedValueOnce([sitter]);

      const result = await getBookingContact(1, 10);
      expect(result).toEqual({
        name: 'Bob',
        avatar_url: null,
        phone: null,
        masked_phone: null,
        role: 'sitter',
      });
    });
  });
});
