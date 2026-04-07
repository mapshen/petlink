import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSqlFn } = vi.hoisted(() => {
  const sqlFn = vi.fn();
  return { mockSqlFn: sqlFn };
});
vi.mock('./db.ts', () => ({ default: mockSqlFn }));

const mockGenerateBackups = vi.fn();
const mockGetBackups = vi.fn();
vi.mock('./backup-sitters.ts', () => ({
  generateBackupsForBooking: (...args: unknown[]) => mockGenerateBackups(...args),
  getBackupsForBooking: (...args: unknown[]) => mockGetBackups(...args),
}));

vi.mock('./logger.ts', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  sanitizeError: (e: unknown) => e,
}));

let testUserId = 1;
vi.mock('./auth.ts', () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.userId = testUserId;
    next();
  },
}));

import express from 'express';
import request from 'supertest';
import backupSitterRoutes from './routes/backup-sitters.ts';

function createApp(userId = 1) {
  testUserId = userId;
  const app = express();
  app.use(express.json());
  const router = express.Router();
  backupSitterRoutes(router);
  app.use('/api/v1', router);
  return app;
}

describe('backup sitter routes', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('GET /bookings/:id/backups', () => {
    it('returns backup sitters for a booking owned by requesting user', async () => {
      const app = createApp(1);
      mockSqlFn.mockResolvedValueOnce([{ id: 100, owner_id: 1, sitter_id: 5 }]);
      mockGetBackups.mockResolvedValueOnce([
        { id: 1, booking_id: 100, sitter_id: 10, rank: 1, status: 'suggested', name: 'Alice' },
      ]);

      const res = await request(app).get('/api/v1/bookings/100/backups');
      expect(res.status).toBe(200);
      expect(res.body.backups).toHaveLength(1);
      expect(res.body.backups[0].name).toBe('Alice');
    });

    it('returns 404 when booking does not exist', async () => {
      const app = createApp(1);
      mockSqlFn.mockResolvedValueOnce([]);

      const res = await request(app).get('/api/v1/bookings/999/backups');
      expect(res.status).toBe(404);
    });

    it('returns 403 when user is not the owner', async () => {
      const app = createApp(2);
      mockSqlFn.mockResolvedValueOnce([{ id: 100, owner_id: 1, sitter_id: 5 }]);

      const res = await request(app).get('/api/v1/bookings/100/backups');
      expect(res.status).toBe(403);
    });

    it('returns 400 for invalid booking ID', async () => {
      const app = createApp(1);
      const res = await request(app).get('/api/v1/bookings/abc/backups');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /bookings/:id/backups/generate', () => {
    it('generates backups for a confirmed booking', async () => {
      const app = createApp(1);
      mockSqlFn.mockResolvedValueOnce([{ id: 100, owner_id: 1, sitter_id: 5, status: 'confirmed' }]);
      mockGenerateBackups.mockResolvedValueOnce([
        { id: 1, booking_id: 100, sitter_id: 10, rank: 1, status: 'suggested' },
        { id: 2, booking_id: 100, sitter_id: 11, rank: 2, status: 'suggested' },
      ]);

      const res = await request(app).post('/api/v1/bookings/100/backups/generate');
      expect(res.status).toBe(200);
      expect(res.body.backups).toHaveLength(2);
    });

    it('returns 409 for non-confirmed bookings', async () => {
      const app = createApp(1);
      mockSqlFn.mockResolvedValueOnce([{ id: 100, owner_id: 1, sitter_id: 5, status: 'pending' }]);

      const res = await request(app).post('/api/v1/bookings/100/backups/generate');
      expect(res.status).toBe(409);
    });

    it('returns 404 when booking does not exist', async () => {
      const app = createApp(1);
      mockSqlFn.mockResolvedValueOnce([]);

      const res = await request(app).post('/api/v1/bookings/999/backups/generate');
      expect(res.status).toBe(404);
    });

    it('returns 403 when user is not the owner', async () => {
      const app = createApp(2);
      mockSqlFn.mockResolvedValueOnce([{ id: 100, owner_id: 1, sitter_id: 5, status: 'confirmed' }]);

      const res = await request(app).post('/api/v1/bookings/100/backups/generate');
      expect(res.status).toBe(403);
    });

    it('returns 400 for invalid booking ID', async () => {
      const app = createApp(1);
      const res = await request(app).post('/api/v1/bookings/0/backups/generate');
      expect(res.status).toBe(400);
    });
  });
});
