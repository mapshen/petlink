import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './auth.ts';

// --- Mock DB before any route import ---
const { mockSqlFn } = vi.hoisted(() => ({ mockSqlFn: vi.fn() }));
vi.mock('./db.ts', () => ({ default: mockSqlFn }));

// --- Mock auth middleware — injects userId (default 1, overridable via header) ---
vi.mock('./auth.ts', () => ({
  authMiddleware: (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    req.userId = Number(req.headers['x-test-user-id'] ?? 1);
    next();
  },
}));

// --- Mock bot detection — pass-through in tests ---
vi.mock('./bot-detection.ts', () => ({
  botBlockMiddleware: (_req: any, _res: any, next: NextFunction) => next(),
  requireUserAgent: (_req: any, _res: any, next: NextFunction) => next(),
}));

// Import route installer after mocks
const { default: addonRoutes } = await import('./routes/addons.ts');
const { default: request } = await import('supertest');

// Dummy rate limiter (pass-through)
const noopLimiter = (_req: any, _res: any, next: NextFunction) => next();

function createApp() {
  const app = express();
  app.use(express.json());
  const router = express.Router();
  addonRoutes(router, noopLimiter as any);
  app.use(router);
  return app;
}

const app = createApp();

// ---------------------------------------------------------------------------
// GET /addons/me
// ---------------------------------------------------------------------------
describe('GET /addons/me', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the authenticated sitter\'s add-ons', async () => {
    const fakeAddons = [
      { id: 1, sitter_id: 1, addon_slug: 'bathing', price_cents: 1500, notes: null },
      { id: 2, sitter_id: 1, addon_slug: 'nail_trimming', price_cents: 1000, notes: 'Small dogs only' },
    ];
    mockSqlFn.mockResolvedValueOnce(fakeAddons as any);

    const res = await request(app).get('/addons/me');

    expect(res.status).toBe(200);
    expect(res.body.addons).toHaveLength(2);
    expect(res.body.addons[0].addon_slug).toBe('bathing');
    expect(res.body.addons[1].notes).toBe('Small dogs only');
  });

  it('returns empty array when sitter has no add-ons', async () => {
    mockSqlFn.mockResolvedValueOnce([] as any);

    const res = await request(app).get('/addons/me');

    expect(res.status).toBe(200);
    expect(res.body.addons).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// GET /addons/sitter/:sitterId
// ---------------------------------------------------------------------------
describe('GET /addons/sitter/:sitterId', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns add-ons for a valid sitter id', async () => {
    const fakeAddons = [
      { id: 1, addon_slug: 'bathing', price_cents: 1500, notes: null },
    ];
    mockSqlFn.mockResolvedValueOnce(fakeAddons as any);

    const res = await request(app).get('/addons/sitter/5');

    expect(res.status).toBe(200);
    expect(res.body.addons).toHaveLength(1);
    expect(res.body.addons[0].addon_slug).toBe('bathing');
  });

  it('returns empty array when sitter has no add-ons', async () => {
    mockSqlFn.mockResolvedValueOnce([] as any);

    const res = await request(app).get('/addons/sitter/5');

    expect(res.status).toBe(200);
    expect(res.body.addons).toEqual([]);
  });

  it('returns 400 for non-integer sitter id', async () => {
    const res = await request(app).get('/addons/sitter/abc');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid sitter ID');
    expect(mockSqlFn).not.toHaveBeenCalled();
  });

  it('returns 400 for zero sitter id', async () => {
    const res = await request(app).get('/addons/sitter/0');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid sitter ID');
  });

  it('returns 400 for negative sitter id', async () => {
    const res = await request(app).get('/addons/sitter/-1');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid sitter ID');
  });
});

// ---------------------------------------------------------------------------
// POST /addons
// ---------------------------------------------------------------------------
describe('POST /addons', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates an add-on for an approved sitter', async () => {
    // 1st SQL call: user lookup
    mockSqlFn.mockResolvedValueOnce([{ roles: ['owner', 'sitter'], approval_status: 'approved' }] as any);
    // 2nd SQL call: INSERT ... ON CONFLICT DO NOTHING RETURNING *
    const created = { id: 10, sitter_id: 1, addon_slug: 'bathing', price_cents: 1500, notes: 'Warm water only' };
    mockSqlFn.mockResolvedValueOnce([created] as any);

    const res = await request(app)
      .post('/addons')
      .send({ addon_slug: 'bathing', price_cents: 1500, notes: 'Warm water only' });

    expect(res.status).toBe(201);
    expect(res.body.addon.addon_slug).toBe('bathing');
    expect(res.body.addon.price_cents).toBe(1500);
    expect(res.body.addon.notes).toBe('Warm water only');
    expect(mockSqlFn).toHaveBeenCalledTimes(2);
  });

  it('creates an add-on for an onboarding sitter', async () => {
    mockSqlFn.mockResolvedValueOnce([{ roles: ['owner', 'sitter'], approval_status: 'onboarding' }] as any);
    mockSqlFn.mockResolvedValueOnce([{ id: 11, sitter_id: 1, addon_slug: 'nail_trimming', price_cents: 800, notes: null }] as any);

    const res = await request(app)
      .post('/addons')
      .send({ addon_slug: 'nail_trimming', price_cents: 800 });

    expect(res.status).toBe(201);
    expect(res.body.addon.addon_slug).toBe('nail_trimming');
  });

  it('creates an add-on with null notes when notes omitted', async () => {
    mockSqlFn.mockResolvedValueOnce([{ roles: ['owner', 'sitter'], approval_status: 'approved' }] as any);
    mockSqlFn.mockResolvedValueOnce([{ id: 12, sitter_id: 1, addon_slug: 'daily_updates', price_cents: 0, notes: null }] as any);

    const res = await request(app)
      .post('/addons')
      .send({ addon_slug: 'daily_updates', price_cents: 0 });

    expect(res.status).toBe(201);
    expect(res.body.addon.notes).toBeNull();
  });

  it('returns 400 when canOfferFree is false and price is 0', async () => {
    mockSqlFn.mockResolvedValueOnce([{ roles: ['owner', 'sitter'], approval_status: 'approved' }] as any);

    const res = await request(app)
      .post('/addons')
      .send({ addon_slug: 'medication_admin', price_cents: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('This add-on requires a price above $0');
  });

  it('returns 403 when user does not have sitter role', async () => {
    mockSqlFn.mockResolvedValueOnce([{ roles: ['owner'], approval_status: 'approved' }] as any);

    const res = await request(app)
      .post('/addons')
      .send({ addon_slug: 'bathing', price_cents: 1500 });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Only sitters can manage add-ons');
    // Only the user lookup query should have been called
    expect(mockSqlFn).toHaveBeenCalledTimes(1);
  });

  it('returns 403 when sitter approval status is rejected', async () => {
    mockSqlFn.mockResolvedValueOnce([{ roles: ['owner', 'sitter'], approval_status: 'rejected' }] as any);

    const res = await request(app)
      .post('/addons')
      .send({ addon_slug: 'bathing', price_cents: 1500 });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Your sitter account is not active.');
  });

  it('returns 403 when sitter approval status is pending_approval', async () => {
    mockSqlFn.mockResolvedValueOnce([{ roles: ['owner', 'sitter'], approval_status: 'pending_approval' }] as any);

    const res = await request(app)
      .post('/addons')
      .send({ addon_slug: 'bathing', price_cents: 1500 });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Your sitter account is not active.');
  });

  it('returns 403 when sitter approval status is banned', async () => {
    mockSqlFn.mockResolvedValueOnce([{ roles: ['owner', 'sitter'], approval_status: 'banned' }] as any);

    const res = await request(app)
      .post('/addons')
      .send({ addon_slug: 'bathing', price_cents: 1500 });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Your sitter account is not active.');
  });

  it('returns 409 when duplicate addon_slug for this sitter', async () => {
    mockSqlFn.mockResolvedValueOnce([{ roles: ['owner', 'sitter'], approval_status: 'approved' }] as any);
    // ON CONFLICT DO NOTHING returns empty when duplicate exists
    mockSqlFn.mockResolvedValueOnce([] as any);

    const res = await request(app)
      .post('/addons')
      .send({ addon_slug: 'bathing', price_cents: 1500 });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('You have already enabled this add-on. Edit it instead.');
    expect(mockSqlFn).toHaveBeenCalledTimes(2);
  });

  it('returns 400 for invalid addon_slug', async () => {
    const res = await request(app)
      .post('/addons')
      .send({ addon_slug: 'totally_fake_addon', price_cents: 1500 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
    // Validation rejects before any DB call
    expect(mockSqlFn).not.toHaveBeenCalled();
  });

  it('returns 400 for negative price_cents', async () => {
    const res = await request(app)
      .post('/addons')
      .send({ addon_slug: 'bathing', price_cents: -100 });

    expect(res.status).toBe(400);
    expect(mockSqlFn).not.toHaveBeenCalled();
  });

  it('returns 400 for price_cents over 50000', async () => {
    const res = await request(app)
      .post('/addons')
      .send({ addon_slug: 'bathing', price_cents: 50001 });

    expect(res.status).toBe(400);
    expect(mockSqlFn).not.toHaveBeenCalled();
  });

  it('returns 400 for non-integer price_cents', async () => {
    const res = await request(app)
      .post('/addons')
      .send({ addon_slug: 'bathing', price_cents: 15.5 });

    expect(res.status).toBe(400);
    expect(mockSqlFn).not.toHaveBeenCalled();
  });

  it('returns 400 when addon_slug is missing', async () => {
    const res = await request(app)
      .post('/addons')
      .send({ price_cents: 1500 });

    expect(res.status).toBe(400);
    expect(mockSqlFn).not.toHaveBeenCalled();
  });

  it('returns 400 when price_cents is missing', async () => {
    const res = await request(app)
      .post('/addons')
      .send({ addon_slug: 'bathing' });

    expect(res.status).toBe(400);
    expect(mockSqlFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// PUT /addons/:id
// ---------------------------------------------------------------------------
describe('PUT /addons/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates price and notes for an owned add-on', async () => {
    // Ownership check
    mockSqlFn.mockResolvedValueOnce([{ id: 10, sitter_id: 1, addon_slug: 'bathing', price_cents: 1500, notes: null }] as any);
    // Update
    const updated = { id: 10, sitter_id: 1, addon_slug: 'bathing', price_cents: 2000, notes: 'With conditioner' };
    mockSqlFn.mockResolvedValueOnce([updated] as any);

    const res = await request(app)
      .put('/addons/10')
      .send({ price_cents: 2000, notes: 'With conditioner' });

    expect(res.status).toBe(200);
    expect(res.body.addon.price_cents).toBe(2000);
    expect(res.body.addon.notes).toBe('With conditioner');
    expect(mockSqlFn).toHaveBeenCalledTimes(2);
  });

  it('updates with null notes', async () => {
    mockSqlFn.mockResolvedValueOnce([{ id: 10, sitter_id: 1, addon_slug: 'bathing', price_cents: 1500, notes: 'old' }] as any);
    const updated = { id: 10, sitter_id: 1, addon_slug: 'bathing', price_cents: 500, notes: null };
    mockSqlFn.mockResolvedValueOnce([updated] as any);

    const res = await request(app)
      .put('/addons/10')
      .send({ price_cents: 500, notes: null });

    expect(res.status).toBe(200);
    expect(res.body.addon.price_cents).toBe(500);
    expect(res.body.addon.notes).toBeNull();
  });

  it('updates with zero price_cents', async () => {
    mockSqlFn.mockResolvedValueOnce([{ id: 10, sitter_id: 1, addon_slug: 'daily_updates', price_cents: 500, notes: null }] as any);
    const updated = { id: 10, sitter_id: 1, addon_slug: 'daily_updates', price_cents: 0, notes: null };
    mockSqlFn.mockResolvedValueOnce([updated] as any);

    const res = await request(app)
      .put('/addons/10')
      .send({ price_cents: 0 });

    expect(res.status).toBe(200);
    expect(res.body.addon.price_cents).toBe(0);
  });

  it('returns 400 when canOfferFree is false and price is 0', async () => {
    mockSqlFn.mockResolvedValueOnce([{ id: 10, sitter_id: 1, addon_slug: 'medication_admin', price_cents: 500, notes: null }] as any);

    const res = await request(app)
      .put('/addons/10')
      .send({ price_cents: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('This add-on requires a price above $0');
  });

  it('returns 404 when add-on not found', async () => {
    mockSqlFn.mockResolvedValueOnce([] as any);

    const res = await request(app)
      .put('/addons/999')
      .send({ price_cents: 2000 });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Add-on not found');
    // Only the ownership check query
    expect(mockSqlFn).toHaveBeenCalledTimes(1);
  });

  it('returns 404 when add-on belongs to another sitter', async () => {
    // SQL filters by sitter_id = req.userId, so another sitter's add-on returns empty
    mockSqlFn.mockResolvedValueOnce([] as any);

    const res = await request(app)
      .put('/addons/10')
      .send({ price_cents: 2000 });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Add-on not found');
  });

  it('returns 400 for negative price_cents', async () => {
    const res = await request(app)
      .put('/addons/10')
      .send({ price_cents: -1 });

    expect(res.status).toBe(400);
    expect(mockSqlFn).not.toHaveBeenCalled();
  });

  it('returns 400 for price_cents over 50000', async () => {
    const res = await request(app)
      .put('/addons/10')
      .send({ price_cents: 50001 });

    expect(res.status).toBe(400);
    expect(mockSqlFn).not.toHaveBeenCalled();
  });

  it('returns 400 when price_cents is missing', async () => {
    const res = await request(app)
      .put('/addons/10')
      .send({ notes: 'Just notes' });

    expect(res.status).toBe(400);
    expect(mockSqlFn).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// DELETE /addons/:id
// ---------------------------------------------------------------------------
describe('DELETE /addons/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('deletes an owned add-on', async () => {
    // Ownership check
    mockSqlFn.mockResolvedValueOnce([{ id: 10, sitter_id: 1, addon_slug: 'bathing', price_cents: 1500, notes: null }] as any);
    // Delete
    mockSqlFn.mockResolvedValueOnce([] as any);

    const res = await request(app).delete('/addons/10');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockSqlFn).toHaveBeenCalledTimes(2);
  });

  it('returns 404 when add-on not found', async () => {
    mockSqlFn.mockResolvedValueOnce([] as any);

    const res = await request(app).delete('/addons/999');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Add-on not found');
    expect(mockSqlFn).toHaveBeenCalledTimes(1);
  });

  it('returns 404 when add-on belongs to another sitter', async () => {
    // SQL query filters by sitter_id = req.userId, returns empty for wrong owner
    mockSqlFn.mockResolvedValueOnce([] as any);

    const res = await request(app).delete('/addons/10');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Add-on not found');
  });
});
