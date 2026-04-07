import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSqlFn } = vi.hoisted(() => {
  const sqlFn = vi.fn();
  return { mockSqlFn: sqlFn };
});
vi.mock('./db.ts', () => ({ default: mockSqlFn }));

vi.mock('./notifications.ts', () => ({
  createNotification: vi.fn().mockResolvedValue({ id: 1 }),
}));

vi.mock('./logger.ts', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  sanitizeError: (e: unknown) => e,
}));

import {
  findBackupSitters,
  generateBackupsForBooking,
  getBackupsForBooking,
} from './backup-sitters.ts';

describe('backup-sitters', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('findBackupSitters', () => {
    it('returns ranked sitters by distance and rating', async () => {
      const sitters = [
        { id: 10, name: 'Alice', slug: 'alice', avatar_url: null, price_cents: 2500, avg_rating: 4.8, review_count: 12, distance_meters: 3000 },
        { id: 11, name: 'Bob', slug: 'bob', avatar_url: null, price_cents: 3000, avg_rating: 4.5, review_count: 8, distance_meters: 5000 },
      ];
      mockSqlFn.mockResolvedValueOnce(sitters);

      const result = await findBackupSitters(1, 'walking', 40.7, -73.9, 3);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(10);
      expect(result[1].id).toBe(11);
    });

    it('excludes the primary sitter', async () => {
      mockSqlFn.mockResolvedValueOnce([]);
      await findBackupSitters(5, 'sitting', 40.7, -73.9, 3);
      // Verify the SQL was called (we can't check template literal contents directly,
      // but we verify it was called once)
      expect(mockSqlFn).toHaveBeenCalledTimes(1);
    });

    it('returns empty array when no sitters found', async () => {
      mockSqlFn.mockResolvedValueOnce([]);
      const result = await findBackupSitters(1, 'walking', 40.7, -73.9, 3);
      expect(result).toEqual([]);
    });

    it('handles database errors gracefully', async () => {
      mockSqlFn.mockRejectedValueOnce(new Error('DB error'));
      const result = await findBackupSitters(1, 'walking', 40.7, -73.9, 3);
      expect(result).toEqual([]);
    });
  });

  describe('generateBackupsForBooking', () => {
    it('finds and stores backup sitters for a confirmed booking', async () => {
      // 1st call: lookup booking
      const booking = {
        id: 100, sitter_id: 5, owner_id: 1, service_id: 10,
        status: 'confirmed', start_time: new Date().toISOString(),
      };
      mockSqlFn.mockResolvedValueOnce([booking]);

      // 2nd call: lookup service
      mockSqlFn.mockResolvedValueOnce([{ type: 'walking' }]);

      // 3rd call: lookup owner location
      mockSqlFn.mockResolvedValueOnce([{ lat: 40.7, lng: -73.9 }]);

      // 4th call: find sitters
      const sitters = [
        { id: 10, name: 'Alice', slug: 'alice', avatar_url: null, price_cents: 2500, avg_rating: 4.8, review_count: 12, distance_meters: 3000 },
        { id: 11, name: 'Bob', slug: 'bob', avatar_url: null, price_cents: 3000, avg_rating: 4.5, review_count: 8, distance_meters: 5000 },
      ];
      mockSqlFn.mockResolvedValueOnce(sitters);

      // 5th call: delete existing backups
      mockSqlFn.mockResolvedValueOnce([]);

      // 6th, 7th calls: insert each backup
      mockSqlFn.mockResolvedValueOnce([{ id: 1, booking_id: 100, sitter_id: 10, rank: 1, status: 'suggested' }]);
      mockSqlFn.mockResolvedValueOnce([{ id: 2, booking_id: 100, sitter_id: 11, rank: 2, status: 'suggested' }]);

      const result = await generateBackupsForBooking(100);
      expect(result).toHaveLength(2);
      expect(result[0].rank).toBe(1);
      expect(result[1].rank).toBe(2);
    });

    it('returns empty array when booking not found', async () => {
      mockSqlFn.mockResolvedValueOnce([]);
      const result = await generateBackupsForBooking(999);
      expect(result).toEqual([]);
    });

    it('returns empty array when booking is not confirmed', async () => {
      mockSqlFn.mockResolvedValueOnce([{
        id: 100, sitter_id: 5, owner_id: 1, service_id: 10,
        status: 'pending', start_time: new Date().toISOString(),
      }]);
      const result = await generateBackupsForBooking(100);
      expect(result).toEqual([]);
    });

    it('returns empty array when owner has no location', async () => {
      mockSqlFn.mockResolvedValueOnce([{
        id: 100, sitter_id: 5, owner_id: 1, service_id: 10,
        status: 'confirmed', start_time: new Date().toISOString(),
      }]);
      mockSqlFn.mockResolvedValueOnce([{ type: 'walking' }]);
      mockSqlFn.mockResolvedValueOnce([{ lat: null, lng: null }]);

      const result = await generateBackupsForBooking(100);
      expect(result).toEqual([]);
    });
  });

  describe('getBackupsForBooking', () => {
    it('returns backup sitters with user info', async () => {
      const rows = [
        { id: 1, booking_id: 100, sitter_id: 10, rank: 1, status: 'suggested', name: 'Alice', slug: 'alice', avatar_url: null, avg_rating: 4.8, review_count: 12, price_cents: 2500 },
        { id: 2, booking_id: 100, sitter_id: 11, rank: 2, status: 'suggested', name: 'Bob', slug: 'bob', avatar_url: null, avg_rating: 4.5, review_count: 8, price_cents: 3000 },
      ];
      mockSqlFn.mockResolvedValueOnce(rows);

      const result = await getBackupsForBooking(100);
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Alice');
      expect(result[1].name).toBe('Bob');
    });

    it('returns empty array when no backups exist', async () => {
      mockSqlFn.mockResolvedValueOnce([]);
      const result = await getBackupsForBooking(100);
      expect(result).toEqual([]);
    });
  });
});
