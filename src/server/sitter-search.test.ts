import { describe, it, expect, vi, beforeEach } from 'vitest';

// Smart SQL mock: returns a fragment marker for sub-expressions, resolves with
// queued data for actual await-ed queries (tagged template calls).
const { mockSql, queueResult, clearQueue } = vi.hoisted(() => {
  const queue: any[] = [];
  const FRAGMENT = Symbol('sql-fragment');

  // Tagged-template function.  postgres calls sql`...` which invokes fn(strings, ...values).
  // Sub-expressions like sql`ST_SetSRID(...)` also call it — they return a fragment marker.
  // Top-level queries are awaited → need .then/.catch, i.e. a thenable.
  const fn: any = (..._args: any[]): any => {
    const fragment: any = { [FRAGMENT]: true, toPostgres: () => '' };
    fragment.then = (resolve: any, reject: any) => {
      const result = queue.shift();
      if (result instanceof Error) return Promise.reject(result).catch(reject);
      return Promise.resolve(result ?? []).then(resolve, reject);
    };
    fragment.catch = (reject: any) => Promise.resolve([]).catch(reject);
    fragment.map = () => [];
    fragment.filter = () => [];
    fragment.length = 0;
    return fragment;
  };

  return {
    mockSql: fn,
    queueResult: (data: any) => queue.push(data),
    clearQueue: () => { queue.length = 0; },
  };
});

vi.mock('./db.ts', () => ({ default: mockSql }));
vi.mock('./bot-detection.ts', () => ({
  botBlockMiddleware: (_req: any, _res: any, next: any) => next(),
  requireUserAgent: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('./turnstile.ts', () => ({
  verifyTurnstile: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('./profile-views.ts', () => ({
  recordProfileView: vi.fn().mockResolvedValue(undefined),
}));

import express from 'express';
import request from 'supertest';
import sitterRoutes from './routes/sitters.ts';

const noopLimiter: any = (_req: any, _res: any, next: any) => next();

function createApp() {
  const app = express();
  app.use(express.json());
  const router = express.Router();
  sitterRoutes(router, noopLimiter);
  app.use('/api/v1', router);
  return app;
}

function makeSitter(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    name: 'Test Sitter',
    roles: ['owner', 'sitter'],
    bio: 'I love pets',
    avatar_url: 'https://example.com/avatar.jpg',
    slug: 'test-sitter',
    lat: 40.71,
    lng: -74.01,
    accepted_pet_sizes: ['small', 'medium'],
    accepted_species: ['dog'],
    years_experience: 3,
    skills: ['basic_obedience'],
    created_at: '2025-06-01T00:00:00Z',
    approved_at: '2025-06-15T00:00:00Z',
    subscription_tier: 'free',
    founding_sitter: false,
    has_fenced_yard: true,
    non_smoking_home: true,
    has_insurance: false,
    one_client_at_a_time: false,
    has_own_pets: true,
    lifestyle_badges: [],
    price_cents: 2500,
    service_type: 'walking',
    max_pets: 3,
    cancellation_policy: 'flexible',
    ...overrides,
  };
}

function makeStats(overrides: Record<string, any> = {}) {
  return {
    sitter_id: 1,
    avg_rating: 4.8,
    review_count: 12,
    completed: 20,
    total: 22,
    avg_response_hours: 1.5,
    repeat_owners: 5,
    unique_owners: 15,
    service_count: 2,
    has_availability: true,
    active_strike_weight: 0,
    ...overrides,
  };
}

describe('GET /api/v1/sitters — trust signals in response', () => {
  beforeEach(() => clearQueue());

  it('returns trust stats fields in each sitter object', async () => {
    const app = createApp();
    queueResult([makeSitter()]);       // main sitter query
    queueResult([makeStats()]);        // ranking stats query
    queueResult([]);                    // addon slugs

    const res = await request(app).get('/api/v1/sitters?serviceType=walking');
    expect(res.status).toBe(200);
    const sitter = res.body.sitters[0];

    expect(sitter).toHaveProperty('avg_response_hours');
    expect(sitter).toHaveProperty('repeat_client_count');
    expect(sitter).toHaveProperty('completion_rate');
    expect(sitter).toHaveProperty('cancellation_policy');
    expect(sitter).toHaveProperty('member_since');
  });

  it('computes correct trust stat values', async () => {
    const app = createApp();
    queueResult([makeSitter({ cancellation_policy: 'strict' })]);
    queueResult([makeStats({ completed: 18, total: 20, avg_response_hours: 0.5, repeat_owners: 8 })]);
    queueResult([]);

    const res = await request(app).get('/api/v1/sitters?serviceType=walking');
    const sitter = res.body.sitters[0];

    expect(sitter.avg_response_hours).toBe(0.5);
    expect(sitter.repeat_client_count).toBe(8);
    expect(sitter.completion_rate).toBeCloseTo(0.9);
    expect(sitter.cancellation_policy).toBe('strict');
    expect(sitter.member_since).toBe('2025-06-01T00:00:00Z');
  });

  it('returns null completion_rate for sitter with no bookings', async () => {
    const app = createApp();
    queueResult([makeSitter()]);
    queueResult([makeStats({ completed: 0, total: 0 })]);
    queueResult([]);

    const res = await request(app).get('/api/v1/sitters?serviceType=walking');
    expect(res.body.sitters[0].completion_rate).toBeNull();
  });
});

describe('GET /api/v1/sitters — new filters', () => {
  beforeEach(() => clearQueue());

  it('accepts cancellationPolicy param without error', async () => {
    const app = createApp();
    queueResult([makeSitter({ cancellation_policy: 'flexible' })]);
    queueResult([makeStats()]);
    queueResult([]);

    const res = await request(app).get('/api/v1/sitters?cancellationPolicy=flexible');
    expect(res.status).toBe(200);
    expect(res.body.sitters[0].cancellation_policy).toBe('flexible');
  });

  it('filters by responseTime', async () => {
    const app = createApp();
    queueResult([makeSitter({ id: 1 }), makeSitter({ id: 2 })]);
    queueResult([
      makeStats({ sitter_id: 1, avg_response_hours: 0.5 }),
      makeStats({ sitter_id: 2, avg_response_hours: 3 }),
    ]);
    queueResult([]);

    const res = await request(app).get('/api/v1/sitters?responseTime=1');
    expect(res.status).toBe(200);
    expect(res.body.sitters).toHaveLength(1);
    expect(res.body.sitters[0].avg_response_hours).toBe(0.5);
  });

  it('accepts dateFrom and dateTo params', async () => {
    const app = createApp();
    queueResult([makeSitter({ id: 1 })]);
    queueResult([makeStats({ sitter_id: 1 })]);
    queueResult([{ sitter_id: 1 }]); // availability date filter query
    queueResult([]); // addons

    const res = await request(app).get('/api/v1/sitters?dateFrom=2026-04-10&dateTo=2026-04-15');
    expect(res.status).toBe(200);
    expect(res.body.sitters).toHaveLength(1);
  });

  it('rejects invalid dateFrom format', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/sitters?dateFrom=not-a-date');
    expect(res.status).toBe(400);
  });

  it('rejects invalid cancellationPolicy value', async () => {
    const app = createApp();
    const res = await request(app).get('/api/v1/sitters?cancellationPolicy=invalid');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/sitters/:idOrSlug — trust signals', () => {
  beforeEach(() => clearQueue());

  it('returns trust stats on profile endpoint', async () => {
    const app = createApp();
    queueResult([makeSitter({ house_rules: 'No shoes inside', cancellation_policy: 'moderate' })]); // sitter
    queueResult([{ type: 'walking', price_cents: 2500, id: 1, sitter_id: 1 }]); // services
    queueResult([]); // addons
    queueResult([]); // photos
    queueResult([{ avg_rating: 4.5, review_count: 8 }]); // review stats
    queueResult([]); // imported reviews
    queueResult([makeStats()]); // trust stats (NEW query)
    queueResult([]); // profile members

    const res = await request(app).get('/api/v1/sitters/test-sitter');
    expect(res.status).toBe(200);

    const s = res.body.sitter;
    expect(s).toHaveProperty('avg_response_hours');
    expect(s).toHaveProperty('repeat_client_count');
    expect(s).toHaveProperty('completion_rate');
    expect(s).toHaveProperty('member_since');
  });
});
