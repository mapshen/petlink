import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockGetOrCreateReferralCode, mockApplyReferralCode, mockGetReferralStats, mockSqlFn } = vi.hoisted(() => ({
  mockGetOrCreateReferralCode: vi.fn(),
  mockApplyReferralCode: vi.fn(),
  mockGetReferralStats: vi.fn(),
  mockSqlFn: vi.fn(),
}));

vi.mock('../referrals.ts', () => ({
  getOrCreateReferralCode: (...args: any[]) => mockGetOrCreateReferralCode(...args),
  applyReferralCode: (...args: any[]) => mockApplyReferralCode(...args),
  getReferralStats: (...args: any[]) => mockGetReferralStats(...args),
}));

vi.mock('../db.ts', () => ({ default: mockSqlFn }));

vi.mock('../auth.ts', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => { _req.userId = 42; next(); },
  AuthenticatedRequest: {},
}));

vi.mock('../validation.ts', () => ({
  validate: () => (_req: any, _res: any, next: any) => next(),
  applyReferralCodeSchema: {},
}));

vi.mock('../logger.ts', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  sanitizeError: (e: any) => e,
}));

import express from 'express';
import request from 'supertest';
import referralRoutes from './referrals.ts';

function createApp() {
  const app = express();
  app.use(express.json());
  const router = express.Router();
  referralRoutes(router);
  app.use('/api/v1', router);
  return app;
}

describe('referral routes', () => {
  beforeEach(() => vi.clearAllMocks());

  describe('GET /referrals/code', () => {
    it('returns the user referral code', async () => {
      mockGetOrCreateReferralCode.mockResolvedValueOnce('ABCD1234');
      const app = createApp();
      const res = await request(app).get('/api/v1/referrals/code').set('Authorization', 'Bearer test');
      expect(res.status).toBe(200);
      expect(res.body.code).toBe('ABCD1234');
    });

    it('returns 500 on error', async () => {
      mockGetOrCreateReferralCode.mockRejectedValueOnce(new Error('DB down'));
      const app = createApp();
      const res = await request(app).get('/api/v1/referrals/code').set('Authorization', 'Bearer test');
      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Failed to get referral code');
    });
  });

  describe('POST /referrals/apply', () => {
    it('applies a valid code', async () => {
      mockApplyReferralCode.mockResolvedValueOnce({ success: true, referral: { id: 1 } });
      const app = createApp();
      const res = await request(app)
        .post('/api/v1/referrals/apply')
        .set('Authorization', 'Bearer test')
        .send({ code: 'GOOD1234' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 400 for invalid code', async () => {
      mockApplyReferralCode.mockResolvedValueOnce({ success: false, error: 'Invalid referral code' });
      const app = createApp();
      const res = await request(app)
        .post('/api/v1/referrals/apply')
        .set('Authorization', 'Bearer test')
        .send({ code: 'BAD12345' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid referral code');
    });

    it('returns 500 on error', async () => {
      mockApplyReferralCode.mockRejectedValueOnce(new Error('DB down'));
      const app = createApp();
      const res = await request(app)
        .post('/api/v1/referrals/apply')
        .set('Authorization', 'Bearer test')
        .send({ code: 'GOOD1234' });
      expect(res.status).toBe(500);
    });
  });

  describe('GET /referrals/stats', () => {
    it('returns referral dashboard stats', async () => {
      const stats = {
        referral_code: 'CODE1234',
        total_referrals: 5,
        pending_referrals: 2,
        completed_referrals: 3,
        total_earned_cents: 3000,
      };
      mockGetReferralStats.mockResolvedValueOnce(stats);
      const app = createApp();
      const res = await request(app).get('/api/v1/referrals/stats').set('Authorization', 'Bearer test');
      expect(res.status).toBe(200);
      expect(res.body).toEqual(stats);
    });

    it('returns 500 on error', async () => {
      mockGetReferralStats.mockRejectedValueOnce(new Error('DB down'));
      const app = createApp();
      const res = await request(app).get('/api/v1/referrals/stats').set('Authorization', 'Bearer test');
      expect(res.status).toBe(500);
    });
  });

  describe('GET /referrals/history', () => {
    it('returns referral history', async () => {
      const referrals = [
        { id: 1, referred_name: 'Alice', status: 'completed', created_at: '2026-01-01' },
        { id: 2, referred_name: 'Bob', status: 'pending', created_at: '2026-02-01' },
      ];
      mockSqlFn.mockResolvedValueOnce(referrals);
      const app = createApp();
      const res = await request(app).get('/api/v1/referrals/history').set('Authorization', 'Bearer test');
      expect(res.status).toBe(200);
      expect(res.body.referrals).toEqual(referrals);
    });

    it('returns 500 on error', async () => {
      mockSqlFn.mockRejectedValueOnce(new Error('DB down'));
      const app = createApp();
      const res = await request(app).get('/api/v1/referrals/history').set('Authorization', 'Bearer test');
      expect(res.status).toBe(500);
    });
  });
});
