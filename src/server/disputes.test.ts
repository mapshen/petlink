import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './auth.ts';
import Database from 'better-sqlite3';
import {
  createDisputeSchema,
  disputeMessageSchema,
  resolveDisputeSchema,
  updateDisputeStatusSchema,
} from './validation.ts';

// ---------------------------------------------------------------------------
// Part 1: Route integration tests (supertest + mocked DB)
// ---------------------------------------------------------------------------

const { mockSqlFn } = vi.hoisted(() => {
  const fn = vi.fn() as any;
  fn.begin = vi.fn(async (callback: (tx: any) => Promise<any>) => {
    const txFn = vi.fn() as any;
    txFn.mockImplementation((...args: any[]) => mockSqlFn(...args));
    return callback(txFn);
  });
  return { mockSqlFn: fn };
});
vi.mock('./db.ts', () => ({ default: mockSqlFn }));

vi.mock('./auth.ts', () => ({
  authMiddleware: (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    req.userId = Number(req.headers['x-test-user-id'] ?? 1);
    next();
  },
}));

vi.mock('./admin.ts', () => ({
  adminMiddleware: (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    req.userId = Number(req.headers['x-test-user-id'] ?? 1);
    next();
  },
}));

vi.mock('./notifications.ts', () => ({
  createNotification: vi.fn().mockResolvedValue({ id: 1 }),
}));

vi.mock('./email.ts', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  buildDisputeStatusEmail: vi.fn().mockReturnValue({ subject: 'test', html: '<p>test</p>' }),
  buildDisputeResolutionEmail: vi.fn().mockReturnValue({ subject: 'test', html: '<p>test</p>' }),
}));

vi.mock('./payments.ts', () => ({
  refundPayment: vi.fn().mockResolvedValue(undefined),
  cancelPayment: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./logger.ts', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
  sanitizeError: (e: Error) => e,
}));

const { default: disputeRoutes } = await import('./routes/disputes.ts');
const { default: request } = await import('supertest');

const mockIo = { to: vi.fn().mockReturnThis(), emit: vi.fn() } as any;

function createApp() {
  const app = express();
  app.use(express.json());
  const router = express.Router();
  disputeRoutes(router, mockIo);
  app.use(router);
  return app;
}

const app = createApp();

// ---------------------------------------------------------------------------
// POST /disputes
// ---------------------------------------------------------------------------
describe('POST /disputes', () => {
  beforeEach(() => vi.clearAllMocks());

  const validBody = { booking_id: 1, reason: 'Sitter did not show up' };

  it('creates a dispute when user is booking owner on a confirmed booking', async () => {
    // 1: booking lookup
    mockSqlFn.mockResolvedValueOnce([{ id: 1, owner_id: 1, sitter_id: 2, status: 'confirmed', start_time: '2026-04-01T10:00:00Z', end_time: '2026-04-01T11:00:00Z', service_type: 'walking' }] as any);
    // 2: active dispute check
    mockSqlFn.mockResolvedValueOnce([] as any);
    // 3: insert dispute
    mockSqlFn.mockResolvedValueOnce([{ id: 10, booking_id: 1, filed_by: 1, reason: 'Sitter did not show up', status: 'open' }] as any);
    // 4: filer lookup
    mockSqlFn.mockResolvedValueOnce([{ name: 'Owner', email: 'owner@test.com' }] as any);
    // 5: other party lookup
    mockSqlFn.mockResolvedValueOnce([{ name: 'Sitter', email: 'sitter@test.com' }] as any);
    // 6: admin lookup
    mockSqlFn.mockResolvedValueOnce([] as any);

    const res = await request(app)
      .post('/disputes')
      .set('x-test-user-id', '1')
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.dispute.id).toBe(10);
    expect(res.body.dispute.status).toBe('open');
  });

  it('creates a dispute on a completed booking within the 14-day window', async () => {
    const recentEnd = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    mockSqlFn.mockResolvedValueOnce([{ id: 2, owner_id: 1, sitter_id: 2, status: 'completed', start_time: '2026-04-01T10:00:00Z', end_time: recentEnd, service_type: 'boarding' }] as any);
    mockSqlFn.mockResolvedValueOnce([] as any);
    mockSqlFn.mockResolvedValueOnce([{ id: 11, booking_id: 2, filed_by: 1, reason: 'Issue', status: 'open' }] as any);
    mockSqlFn.mockResolvedValueOnce([{ name: 'Owner', email: 'owner@test.com' }] as any);
    mockSqlFn.mockResolvedValueOnce([{ name: 'Sitter', email: 'sitter@test.com' }] as any);
    mockSqlFn.mockResolvedValueOnce([] as any);

    const res = await request(app)
      .post('/disputes')
      .set('x-test-user-id', '1')
      .send({ booking_id: 2, reason: 'Issue' });

    expect(res.status).toBe(201);
  });

  it('returns 404 when booking does not exist', async () => {
    mockSqlFn.mockResolvedValueOnce([] as any);

    const res = await request(app)
      .post('/disputes')
      .set('x-test-user-id', '1')
      .send(validBody);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Booking not found');
  });

  it('returns 403 when user is not part of the booking', async () => {
    mockSqlFn.mockResolvedValueOnce([{ id: 1, owner_id: 10, sitter_id: 20, status: 'confirmed', start_time: '2026-04-01T10:00:00Z', end_time: '2026-04-01T11:00:00Z' }] as any);

    const res = await request(app)
      .post('/disputes')
      .set('x-test-user-id', '99')
      .send(validBody);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('You are not part of this booking');
  });

  it('returns 400 when booking status is pending', async () => {
    mockSqlFn.mockResolvedValueOnce([{ id: 1, owner_id: 1, sitter_id: 2, status: 'pending', start_time: '2026-04-01T10:00:00Z', end_time: '2026-04-01T11:00:00Z' }] as any);

    const res = await request(app)
      .post('/disputes')
      .set('x-test-user-id', '1')
      .send(validBody);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Disputes can only be filed on active or completed bookings');
  });

  it('returns 400 when booking status is cancelled', async () => {
    mockSqlFn.mockResolvedValueOnce([{ id: 1, owner_id: 1, sitter_id: 2, status: 'cancelled', start_time: '2026-04-01T10:00:00Z', end_time: '2026-04-01T11:00:00Z' }] as any);

    const res = await request(app)
      .post('/disputes')
      .set('x-test-user-id', '1')
      .send(validBody);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Disputes can only be filed on active or completed bookings');
  });

  it('returns 400 when completed booking is past the 14-day window', async () => {
    const oldEnd = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    mockSqlFn.mockResolvedValueOnce([{ id: 1, owner_id: 1, sitter_id: 2, status: 'completed', start_time: '2026-01-01T10:00:00Z', end_time: oldEnd }] as any);

    const res = await request(app)
      .post('/disputes')
      .set('x-test-user-id', '1')
      .send(validBody);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('within 14 days');
  });

  it('returns 400 when incident_id does not belong to booking', async () => {
    mockSqlFn.mockResolvedValueOnce([{ id: 1, owner_id: 1, sitter_id: 2, status: 'confirmed', start_time: '2026-04-01T10:00:00Z', end_time: '2026-04-01T11:00:00Z' }] as any);
    // incident lookup returns empty
    mockSqlFn.mockResolvedValueOnce([] as any);

    const res = await request(app)
      .post('/disputes')
      .set('x-test-user-id', '1')
      .send({ ...validBody, incident_id: 999 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Incident not found on this booking');
  });

  it('returns 409 when an active dispute already exists', async () => {
    mockSqlFn.mockResolvedValueOnce([{ id: 1, owner_id: 1, sitter_id: 2, status: 'confirmed', start_time: '2026-04-01T10:00:00Z', end_time: '2026-04-01T11:00:00Z' }] as any);
    // active dispute check returns existing
    mockSqlFn.mockResolvedValueOnce([{ id: 5 }] as any);

    const res = await request(app)
      .post('/disputes')
      .set('x-test-user-id', '1')
      .send(validBody);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('An active dispute already exists for this booking');
  });
});

// ---------------------------------------------------------------------------
// GET /disputes
// ---------------------------------------------------------------------------
describe('GET /disputes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns disputes for a regular user (non-admin)', async () => {
    mockSqlFn.mockResolvedValueOnce([{ roles: ['owner'] }] as any); // currentUser
    // sql`` empty fragment inside count query conditional
    mockSqlFn.mockReturnValueOnce('' as any);
    mockSqlFn.mockResolvedValueOnce([{ count: 1 }] as any); // total count
    // sql`` empty fragment inside disputes query conditional
    mockSqlFn.mockReturnValueOnce('' as any);
    mockSqlFn.mockResolvedValueOnce([{ id: 1, booking_id: 1, status: 'open', filed_by_name: 'Owner' }] as any); // disputes

    const res = await request(app)
      .get('/disputes')
      .set('x-test-user-id', '1');

    expect(res.status).toBe(200);
    expect(res.body.disputes).toHaveLength(1);
    expect(res.body.total).toBe(1);
  });

  it('returns all disputes for admin user', async () => {
    mockSqlFn.mockResolvedValueOnce([{ roles: ['owner', 'admin'] }] as any);
    // sql`` empty fragment inside count query conditional
    mockSqlFn.mockReturnValueOnce('' as any);
    mockSqlFn.mockResolvedValueOnce([{ count: 3 }] as any);
    // sql`` empty fragment inside disputes query conditional
    mockSqlFn.mockReturnValueOnce('' as any);
    mockSqlFn.mockResolvedValueOnce([
      { id: 1, status: 'open' },
      { id: 2, status: 'under_review' },
      { id: 3, status: 'resolved' },
    ] as any);

    const res = await request(app)
      .get('/disputes')
      .set('x-test-user-id', '1');

    expect(res.status).toBe(200);
    expect(res.body.disputes).toHaveLength(3);
    expect(res.body.total).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// GET /disputes/:id
// ---------------------------------------------------------------------------
describe('GET /disputes/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns dispute with messages for booking party', async () => {
    mockSqlFn.mockResolvedValueOnce([{
      id: 1, booking_id: 1, owner_id: 1, sitter_id: 2, status: 'open',
      filed_by_name: 'Owner', owner_name: 'Owner', sitter_name: 'Sitter',
    }] as any);
    mockSqlFn.mockResolvedValueOnce([{ roles: ['owner'] }] as any); // currentUser
    // messages (non-admin: filtered)
    mockSqlFn.mockResolvedValueOnce([
      { id: 1, dispute_id: 1, sender_id: 1, content: 'Hello', is_admin_note: false, sender_name: 'Owner' },
    ] as any);

    const res = await request(app)
      .get('/disputes/1')
      .set('x-test-user-id', '1');

    expect(res.status).toBe(200);
    expect(res.body.dispute.id).toBe(1);
    expect(res.body.messages).toHaveLength(1);
    expect(res.body.messages[0].sender_role).toBe('owner');
  });

  it('returns 404 for non-existent dispute', async () => {
    mockSqlFn.mockResolvedValueOnce([] as any);

    const res = await request(app)
      .get('/disputes/999')
      .set('x-test-user-id', '1');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Dispute not found');
  });

  it('returns 403 for user not part of the dispute', async () => {
    mockSqlFn.mockResolvedValueOnce([{ id: 1, booking_id: 1, owner_id: 10, sitter_id: 20, status: 'open' }] as any);
    mockSqlFn.mockResolvedValueOnce([{ roles: ['owner'] }] as any);

    const res = await request(app)
      .get('/disputes/1')
      .set('x-test-user-id', '99');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('You are not part of this dispute');
  });

  it('returns 400 for invalid dispute ID', async () => {
    const res = await request(app)
      .get('/disputes/abc')
      .set('x-test-user-id', '1');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid dispute ID');
  });
});

// ---------------------------------------------------------------------------
// POST /disputes/:id/messages
// ---------------------------------------------------------------------------
describe('POST /disputes/:id/messages', () => {
  beforeEach(() => vi.clearAllMocks());

  it('posts a message to an open dispute', async () => {
    mockSqlFn.mockResolvedValueOnce([{ id: 1, booking_id: 1, owner_id: 1, sitter_id: 2, status: 'open' }] as any);
    mockSqlFn.mockResolvedValueOnce([{ roles: ['owner'], name: 'Owner' }] as any);
    mockSqlFn.mockResolvedValueOnce([{ id: 100, dispute_id: 1, sender_id: 1, content: 'My side', is_admin_note: false, evidence_urls: [] }] as any);
    mockSqlFn.mockResolvedValueOnce(undefined as any); // updated_at update

    const res = await request(app)
      .post('/disputes/1/messages')
      .set('x-test-user-id', '1')
      .send({ content: 'My side' });

    expect(res.status).toBe(201);
    expect(res.body.message.content).toBe('My side');
    expect(res.body.message.sender_role).toBe('owner');
  });

  it('returns 400 when dispute is resolved', async () => {
    mockSqlFn.mockResolvedValueOnce([{ id: 1, booking_id: 1, owner_id: 1, sitter_id: 2, status: 'resolved' }] as any);

    const res = await request(app)
      .post('/disputes/1/messages')
      .set('x-test-user-id', '1')
      .send({ content: 'Too late' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Cannot post to a resolved or closed dispute');
  });

  it('returns 400 when dispute is closed', async () => {
    mockSqlFn.mockResolvedValueOnce([{ id: 1, booking_id: 1, owner_id: 1, sitter_id: 2, status: 'closed' }] as any);

    const res = await request(app)
      .post('/disputes/1/messages')
      .set('x-test-user-id', '1')
      .send({ content: 'Too late' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Cannot post to a resolved or closed dispute');
  });

  it('returns 403 when non-admin tries to post admin note', async () => {
    mockSqlFn.mockResolvedValueOnce([{ id: 1, booking_id: 1, owner_id: 1, sitter_id: 2, status: 'open' }] as any);
    mockSqlFn.mockResolvedValueOnce([{ roles: ['owner'], name: 'Owner' }] as any);

    const res = await request(app)
      .post('/disputes/1/messages')
      .set('x-test-user-id', '1')
      .send({ content: 'Secret note', is_admin_note: true });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Only mediators can post internal notes');
  });

  it('returns 403 for user not part of the dispute', async () => {
    mockSqlFn.mockResolvedValueOnce([{ id: 1, booking_id: 1, owner_id: 10, sitter_id: 20, status: 'open' }] as any);
    mockSqlFn.mockResolvedValueOnce([{ roles: ['owner'], name: 'Other' }] as any);

    const res = await request(app)
      .post('/disputes/1/messages')
      .set('x-test-user-id', '99')
      .send({ content: 'Hello' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('You are not part of this dispute');
  });

  it('returns 404 for non-existent dispute', async () => {
    mockSqlFn.mockResolvedValueOnce([] as any);

    const res = await request(app)
      .post('/disputes/999/messages')
      .set('x-test-user-id', '1')
      .send({ content: 'Hello' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Dispute not found');
  });
});

// ---------------------------------------------------------------------------
// PUT /disputes/:id/status (admin)
// ---------------------------------------------------------------------------
describe('PUT /disputes/:id/status', () => {
  beforeEach(() => vi.clearAllMocks());

  it('admin can update dispute status to under_review', async () => {
    mockSqlFn.mockResolvedValueOnce([{ id: 1, booking_id: 1, owner_id: 2, sitter_id: 3, status: 'open', assigned_admin_id: null }] as any);
    mockSqlFn.mockResolvedValueOnce([{ id: 1, status: 'under_review', assigned_admin_id: 1 }] as any); // updated
    mockSqlFn.mockResolvedValueOnce([{ name: 'Admin' }] as any); // admin name
    // party notifications (2 parties x (user lookup + notif create))
    mockSqlFn.mockResolvedValueOnce([{ name: 'Owner', email: 'owner@test.com' }] as any);
    mockSqlFn.mockResolvedValueOnce([{ name: 'Sitter', email: 'sitter@test.com' }] as any);

    const res = await request(app)
      .put('/disputes/1/status')
      .set('x-test-user-id', '1')
      .send({ status: 'under_review' });

    expect(res.status).toBe(200);
    expect(res.body.dispute.status).toBe('under_review');
  });

  it('returns 404 for non-existent dispute', async () => {
    mockSqlFn.mockResolvedValueOnce([] as any);

    const res = await request(app)
      .put('/disputes/999/status')
      .set('x-test-user-id', '1')
      .send({ status: 'under_review' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Dispute not found');
  });

  it('returns 400 when dispute is already resolved', async () => {
    mockSqlFn.mockResolvedValueOnce([{ id: 1, status: 'resolved', owner_id: 2, sitter_id: 3 }] as any);

    const res = await request(app)
      .put('/disputes/1/status')
      .set('x-test-user-id', '1')
      .send({ status: 'closed' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Cannot change status of a resolved or closed dispute');
  });
});

// ---------------------------------------------------------------------------
// PUT /disputes/:id/resolve (admin)
// ---------------------------------------------------------------------------
describe('PUT /disputes/:id/resolve', () => {
  beforeEach(() => vi.clearAllMocks());

  it('resolves a dispute with no_action', async () => {
    mockSqlFn.mockResolvedValueOnce([{
      id: 1, booking_id: 1, owner_id: 2, sitter_id: 3, status: 'under_review',
      total_price_cents: 5000, payment_intent_id: 'pi_123', payment_status: 'captured',
    }] as any);
    mockSqlFn.mockResolvedValueOnce([{ id: 1, status: 'resolved', resolution_type: 'no_action' }] as any);
    // Notify loop (2 parties)
    mockSqlFn.mockResolvedValueOnce([{ name: 'Owner', email: 'owner@test.com' }] as any);
    mockSqlFn.mockResolvedValueOnce([{ name: 'Sitter', email: 'sitter@test.com' }] as any);

    const res = await request(app)
      .put('/disputes/1/resolve')
      .set('x-test-user-id', '1')
      .send({ resolution_type: 'no_action', resolution_notes: 'No fault found' });

    expect(res.status).toBe(200);
    expect(res.body.dispute.status).toBe('resolved');
    expect(res.body.dispute.resolution_type).toBe('no_action');
  });

  it('returns 404 for non-existent dispute', async () => {
    mockSqlFn.mockResolvedValueOnce([] as any);

    const res = await request(app)
      .put('/disputes/999/resolve')
      .set('x-test-user-id', '1')
      .send({ resolution_type: 'no_action', resolution_notes: 'N/A' });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Dispute not found');
  });

  it('returns 400 when dispute is already resolved', async () => {
    mockSqlFn.mockResolvedValueOnce([{ id: 1, status: 'resolved', owner_id: 2, sitter_id: 3 }] as any);

    const res = await request(app)
      .put('/disputes/1/resolve')
      .set('x-test-user-id', '1')
      .send({ resolution_type: 'no_action', resolution_notes: 'N/A' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Dispute is already resolved or closed');
  });

  it('returns 400 when dispute is already closed', async () => {
    mockSqlFn.mockResolvedValueOnce([{ id: 1, status: 'closed', owner_id: 2, sitter_id: 3 }] as any);

    const res = await request(app)
      .put('/disputes/1/resolve')
      .set('x-test-user-id', '1')
      .send({ resolution_type: 'no_action', resolution_notes: 'N/A' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Dispute is already resolved or closed');
  });

  it('returns 400 when partial_refund is missing amount', async () => {
    mockSqlFn.mockResolvedValueOnce([{
      id: 1, booking_id: 1, owner_id: 2, sitter_id: 3, status: 'under_review',
      total_price_cents: 5000, payment_intent_id: 'pi_123', payment_status: 'captured',
    }] as any);

    const res = await request(app)
      .put('/disputes/1/resolve')
      .set('x-test-user-id', '1')
      .send({ resolution_type: 'partial_refund', resolution_notes: 'Partial issue' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Partial refund requires an amount');
  });

  it('returns 400 when refund amount exceeds booking total', async () => {
    mockSqlFn.mockResolvedValueOnce([{
      id: 1, booking_id: 1, owner_id: 2, sitter_id: 3, status: 'under_review',
      total_price_cents: 5000, payment_intent_id: 'pi_123', payment_status: 'captured',
    }] as any);

    const res = await request(app)
      .put('/disputes/1/resolve')
      .set('x-test-user-id', '1')
      .send({ resolution_type: 'partial_refund', resolution_amount_cents: 9999, resolution_notes: 'Too much' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Refund amount cannot exceed booking total');
  });
});

// ---------------------------------------------------------------------------
// Part 2: Validation schema tests (pure unit tests)
// ---------------------------------------------------------------------------
describe('createDisputeSchema', () => {
  it('accepts valid input', () => {
    const result = createDisputeSchema.safeParse({ booking_id: 1, reason: 'Service was poor' });
    expect(result.success).toBe(true);
  });

  it('accepts optional incident_id', () => {
    const result = createDisputeSchema.safeParse({ booking_id: 1, incident_id: 5, reason: 'Linked to incident' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.incident_id).toBe(5);
  });

  it('rejects missing reason', () => {
    const result = createDisputeSchema.safeParse({ booking_id: 1 });
    expect(result.success).toBe(false);
  });

  it('rejects empty reason', () => {
    const result = createDisputeSchema.safeParse({ booking_id: 1, reason: '   ' });
    expect(result.success).toBe(false);
  });

  it('rejects reason exceeding 2000 characters', () => {
    const result = createDisputeSchema.safeParse({ booking_id: 1, reason: 'x'.repeat(2001) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Reason must be under 2000 characters');
    }
  });

  it('rejects invalid booking_id (zero)', () => {
    const result = createDisputeSchema.safeParse({ booking_id: 0, reason: 'test' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid booking_id (negative)', () => {
    const result = createDisputeSchema.safeParse({ booking_id: -1, reason: 'test' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid booking_id (non-integer)', () => {
    const result = createDisputeSchema.safeParse({ booking_id: 1.5, reason: 'test' });
    expect(result.success).toBe(false);
  });
});

describe('disputeMessageSchema', () => {
  it('accepts valid message', () => {
    const result = disputeMessageSchema.safeParse({ content: 'Here is my response' });
    expect(result.success).toBe(true);
  });

  it('accepts message with evidence_urls', () => {
    const result = disputeMessageSchema.safeParse({
      content: 'See photos',
      evidence_urls: ['https://example.com/photo1.jpg', 'https://example.com/photo2.jpg'],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.evidence_urls).toHaveLength(2);
  });

  it('accepts message with is_admin_note', () => {
    const result = disputeMessageSchema.safeParse({ content: 'Internal note', is_admin_note: true });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.is_admin_note).toBe(true);
  });

  it('defaults is_admin_note to false', () => {
    const result = disputeMessageSchema.safeParse({ content: 'Hello' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.is_admin_note).toBe(false);
  });

  it('defaults evidence_urls to empty array', () => {
    const result = disputeMessageSchema.safeParse({ content: 'Hello' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.evidence_urls).toEqual([]);
  });

  it('rejects empty content', () => {
    const result = disputeMessageSchema.safeParse({ content: '' });
    expect(result.success).toBe(false);
  });

  it('rejects whitespace-only content', () => {
    const result = disputeMessageSchema.safeParse({ content: '   ' });
    expect(result.success).toBe(false);
  });

  it('rejects content exceeding 2000 characters', () => {
    const result = disputeMessageSchema.safeParse({ content: 'x'.repeat(2001) });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Message must be under 2000 characters');
    }
  });

  it('allows maximum 4 evidence URLs', () => {
    const result = disputeMessageSchema.safeParse({
      content: 'Photos',
      evidence_urls: [
        'https://example.com/1.jpg',
        'https://example.com/2.jpg',
        'https://example.com/3.jpg',
        'https://example.com/4.jpg',
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects more than 4 evidence URLs', () => {
    const result = disputeMessageSchema.safeParse({
      content: 'Too many',
      evidence_urls: Array.from({ length: 5 }, (_, i) => `https://example.com/${i}.jpg`),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Maximum 4 evidence items');
    }
  });

  it('rejects non-HTTPS evidence URL', () => {
    const result = disputeMessageSchema.safeParse({
      content: 'Photo',
      evidence_urls: ['http://example.com/photo.jpg'],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('URL must use HTTPS');
    }
  });

  it('rejects invalid URL in evidence', () => {
    const result = disputeMessageSchema.safeParse({
      content: 'Photo',
      evidence_urls: ['not-a-url'],
    });
    expect(result.success).toBe(false);
  });
});

describe('resolveDisputeSchema', () => {
  const allResolutionTypes = [
    'full_refund', 'partial_refund', 'credit', 'warning_owner',
    'warning_sitter', 'ban_sitter', 'ban_owner', 'no_action',
  ] as const;

  it.each(allResolutionTypes)('accepts valid resolution type: %s', (type) => {
    const body: Record<string, unknown> = { resolution_type: type, resolution_notes: 'Decision made' };
    if (type === 'partial_refund') body.resolution_amount_cents = 1000;
    const result = resolveDisputeSchema.safeParse(body);
    expect(result.success).toBe(true);
  });

  it('rejects invalid resolution type', () => {
    const result = resolveDisputeSchema.safeParse({ resolution_type: 'slap_on_wrist', resolution_notes: 'Hmm' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Invalid resolution type');
    }
  });

  it('rejects missing resolution_notes', () => {
    const result = resolveDisputeSchema.safeParse({ resolution_type: 'no_action' });
    expect(result.success).toBe(false);
  });

  it('rejects empty resolution_notes', () => {
    const result = resolveDisputeSchema.safeParse({ resolution_type: 'no_action', resolution_notes: '  ' });
    expect(result.success).toBe(false);
  });

  it('rejects resolution_notes exceeding 2000 characters', () => {
    const result = resolveDisputeSchema.safeParse({ resolution_type: 'no_action', resolution_notes: 'x'.repeat(2001) });
    expect(result.success).toBe(false);
  });

  it('accepts partial_refund with valid amount', () => {
    const result = resolveDisputeSchema.safeParse({
      resolution_type: 'partial_refund',
      resolution_amount_cents: 2500,
      resolution_notes: 'Half refund',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.resolution_amount_cents).toBe(2500);
  });

  it('rejects partial_refund with zero amount via schema', () => {
    const result = resolveDisputeSchema.safeParse({
      resolution_type: 'partial_refund',
      resolution_amount_cents: 0,
      resolution_notes: 'Free?',
    });
    expect(result.success).toBe(false);
  });

  it('allows null resolution_amount_cents for non-refund types', () => {
    const result = resolveDisputeSchema.safeParse({
      resolution_type: 'warning_sitter',
      resolution_amount_cents: null,
      resolution_notes: 'First warning',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.resolution_amount_cents).toBeNull();
  });
});

describe('updateDisputeStatusSchema', () => {
  it.each(['under_review', 'awaiting_response', 'closed'] as const)('accepts valid status: %s', (status) => {
    const result = updateDisputeStatusSchema.safeParse({ status });
    expect(result.success).toBe(true);
  });

  it('rejects "open" as update status', () => {
    const result = updateDisputeStatusSchema.safeParse({ status: 'open' });
    expect(result.success).toBe(false);
  });

  it('rejects "resolved" as update status', () => {
    const result = updateDisputeStatusSchema.safeParse({ status: 'resolved' });
    expect(result.success).toBe(false);
  });

  it('rejects arbitrary invalid status', () => {
    const result = updateDisputeStatusSchema.safeParse({ status: 'deleted' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe('Status must be under_review, awaiting_response, or closed');
    }
  });
});

// ---------------------------------------------------------------------------
// Part 3: SQLite in-memory DB tests (data integrity, cascades, constraints)
// ---------------------------------------------------------------------------
describe('dispute data integrity (SQLite)', () => {
  let db: ReturnType<typeof Database>;

  beforeAll(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        roles TEXT DEFAULT 'owner',
        approval_status TEXT DEFAULT 'approved',
        approval_rejected_reason TEXT
      );
      CREATE TABLE services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sitter_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        price_cents INTEGER NOT NULL,
        FOREIGN KEY (sitter_id) REFERENCES users(id)
      );
      CREATE TABLE bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sitter_id INTEGER NOT NULL,
        owner_id INTEGER NOT NULL,
        service_id INTEGER,
        status TEXT DEFAULT 'pending',
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        total_price_cents INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sitter_id) REFERENCES users(id),
        FOREIGN KEY (owner_id) REFERENCES users(id)
      );
      CREATE TABLE incident_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id INTEGER NOT NULL,
        reporter_id INTEGER NOT NULL,
        category TEXT NOT NULL,
        description TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
        FOREIGN KEY (reporter_id) REFERENCES users(id)
      );
      CREATE TABLE disputes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id INTEGER NOT NULL REFERENCES bookings(id),
        incident_id INTEGER REFERENCES incident_reports(id),
        filed_by INTEGER NOT NULL REFERENCES users(id),
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'under_review', 'awaiting_response', 'resolved', 'closed')),
        assigned_admin_id INTEGER REFERENCES users(id),
        resolution_type TEXT CHECK(resolution_type IN ('full_refund', 'partial_refund', 'credit', 'warning_owner', 'warning_sitter', 'ban_sitter', 'ban_owner', 'no_action')),
        resolution_amount_cents INTEGER,
        resolution_notes TEXT,
        resolved_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX idx_disputes_active_booking ON disputes (booking_id) WHERE status NOT IN ('resolved', 'closed');
      CREATE TABLE dispute_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        dispute_id INTEGER NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
        sender_id INTEGER NOT NULL REFERENCES users(id),
        content TEXT NOT NULL,
        is_admin_note INTEGER DEFAULT 0,
        evidence_urls TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Seed: owner (1), sitter (2), admin (3)
    db.prepare("INSERT INTO users (email, password_hash, name, roles) VALUES ('owner@test.com', 'hash', 'Owner', 'owner')").run();
    db.prepare("INSERT INTO users (email, password_hash, name, roles) VALUES ('sitter@test.com', 'hash', 'Sitter', 'owner,sitter')").run();
    db.prepare("INSERT INTO users (email, password_hash, name, roles) VALUES ('admin@test.com', 'hash', 'Admin', 'owner,admin')").run();
    // Seed service + bookings
    db.prepare("INSERT INTO services (sitter_id, type, price_cents) VALUES (2, 'walking', 2500)").run();
    db.prepare("INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time, total_price_cents) VALUES (2, 1, 1, 'confirmed', '2026-04-10T10:00:00Z', '2026-04-10T11:00:00Z', 5000)").run();
    db.prepare("INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time, total_price_cents) VALUES (2, 1, 1, 'completed', '2026-04-08T10:00:00Z', '2026-04-08T11:00:00Z', 3000)").run();
    db.prepare("INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time, total_price_cents) VALUES (2, 1, 1, 'in_progress', '2026-04-11T10:00:00Z', '2026-04-11T11:00:00Z', 4000)").run();
  });

  afterAll(() => {
    db.close();
  });

  // --- disputes table: insert, query ---
  describe('disputes table', () => {
    it('inserts a dispute and queries by booking_id', () => {
      const info = db.prepare(
        "INSERT INTO disputes (booking_id, filed_by, reason) VALUES (1, 1, 'Sitter no-show')"
      ).run();
      expect(info.changes).toBe(1);

      const row = db.prepare('SELECT * FROM disputes WHERE booking_id = 1').get() as any;
      expect(row.booking_id).toBe(1);
      expect(row.filed_by).toBe(1);
      expect(row.reason).toBe('Sitter no-show');
      expect(row.status).toBe('open');
      expect(row.created_at).toBeDefined();
    });

    it('defaults status to open', () => {
      const row = db.prepare('SELECT status FROM disputes WHERE id = 1').get() as any;
      expect(row.status).toBe('open');
    });
  });

  // --- Unique partial index: only one active dispute per booking ---
  describe('unique active dispute per booking constraint', () => {
    it('rejects a second active dispute on the same booking', () => {
      // First dispute already exists from previous test (booking_id=1, status=open)
      expect(() => {
        db.prepare(
          "INSERT INTO disputes (booking_id, filed_by, reason) VALUES (1, 2, 'Another dispute')"
        ).run();
      }).toThrow();
    });

    it('allows a new dispute after resolving the existing one', () => {
      // Resolve the existing dispute
      db.prepare("UPDATE disputes SET status = 'resolved' WHERE booking_id = 1 AND status = 'open'").run();

      // Now can insert a new active dispute
      const info = db.prepare(
        "INSERT INTO disputes (booking_id, filed_by, reason) VALUES (1, 2, 'New issue after resolution')"
      ).run();
      expect(info.changes).toBe(1);
    });

    it('allows a new dispute after closing the existing one', () => {
      // Close the current active dispute
      db.prepare("UPDATE disputes SET status = 'closed' WHERE booking_id = 1 AND status NOT IN ('resolved', 'closed')").run();

      // Now can insert another active dispute
      const info = db.prepare(
        "INSERT INTO disputes (booking_id, filed_by, reason) VALUES (1, 1, 'Third dispute')"
      ).run();
      expect(info.changes).toBe(1);
    });
  });

  // --- Multiple resolved/closed disputes allowed per booking ---
  describe('multiple resolved/closed disputes per booking', () => {
    it('allows multiple resolved disputes on the same booking', () => {
      // Close current active dispute on booking 1
      db.prepare("UPDATE disputes SET status = 'resolved' WHERE booking_id = 1 AND status NOT IN ('resolved', 'closed')").run();

      // Count resolved/closed for booking 1
      const { cnt } = db.prepare(
        "SELECT COUNT(*) as cnt FROM disputes WHERE booking_id = 1 AND status IN ('resolved', 'closed')"
      ).get() as any;
      expect(cnt).toBeGreaterThanOrEqual(2);
    });

    it('allows inserting another dispute on booking 2 independently', () => {
      const info = db.prepare(
        "INSERT INTO disputes (booking_id, filed_by, reason) VALUES (2, 1, 'Issue on booking 2')"
      ).run();
      expect(info.changes).toBe(1);
    });
  });

  // --- dispute_messages table: insert, CASCADE ---
  describe('dispute_messages table', () => {
    let testDisputeId: number;

    beforeAll(() => {
      // Create a fresh dispute on booking 3 for message tests
      const info = db.prepare(
        "INSERT INTO disputes (booking_id, filed_by, reason) VALUES (3, 1, 'For message tests')"
      ).run();
      testDisputeId = Number(info.lastInsertRowid);
    });

    it('inserts a message linked to a dispute', () => {
      const info = db.prepare(
        'INSERT INTO dispute_messages (dispute_id, sender_id, content) VALUES (?, 1, ?)'
      ).run(testDisputeId, 'I have a concern');
      expect(info.changes).toBe(1);

      const row = db.prepare('SELECT * FROM dispute_messages WHERE id = ?').get(info.lastInsertRowid) as any;
      expect(row.dispute_id).toBe(testDisputeId);
      expect(row.sender_id).toBe(1);
      expect(row.content).toBe('I have a concern');
      expect(row.is_admin_note).toBe(0); // SQLite boolean
    });

    it('supports is_admin_note flag', () => {
      const info = db.prepare(
        'INSERT INTO dispute_messages (dispute_id, sender_id, content, is_admin_note) VALUES (?, 3, ?, 1)'
      ).run(testDisputeId, 'Admin internal note');
      const row = db.prepare('SELECT is_admin_note FROM dispute_messages WHERE id = ?').get(info.lastInsertRowid) as any;
      expect(row.is_admin_note).toBe(1); // truthy in SQLite
    });

    it('supports evidence_urls field', () => {
      const urls = JSON.stringify(['https://example.com/photo1.jpg', 'https://example.com/photo2.jpg']);
      const info = db.prepare(
        'INSERT INTO dispute_messages (dispute_id, sender_id, content, evidence_urls) VALUES (?, 1, ?, ?)'
      ).run(testDisputeId, 'See evidence', urls);
      const row = db.prepare('SELECT evidence_urls FROM dispute_messages WHERE id = ?').get(info.lastInsertRowid) as any;
      const parsed = JSON.parse(row.evidence_urls);
      expect(parsed).toHaveLength(2);
      expect(parsed[0]).toBe('https://example.com/photo1.jpg');
    });

    it('CASCADE deletes messages when dispute is deleted', () => {
      // Create a disposable dispute + messages
      const disputeInfo = db.prepare(
        "INSERT INTO disputes (booking_id, filed_by, reason, status) VALUES (3, 2, 'Cascade test', 'resolved')"
      ).run();
      const dId = disputeInfo.lastInsertRowid;

      db.prepare('INSERT INTO dispute_messages (dispute_id, sender_id, content) VALUES (?, 1, ?)').run(dId, 'Msg 1');
      db.prepare('INSERT INTO dispute_messages (dispute_id, sender_id, content) VALUES (?, 2, ?)').run(dId, 'Msg 2');

      expect((db.prepare('SELECT COUNT(*) as cnt FROM dispute_messages WHERE dispute_id = ?').get(dId) as any).cnt).toBe(2);

      db.prepare('DELETE FROM disputes WHERE id = ?').run(dId);

      expect((db.prepare('SELECT COUNT(*) as cnt FROM dispute_messages WHERE dispute_id = ?').get(dId) as any).cnt).toBe(0);
    });
  });

  // --- Status CHECK constraint ---
  describe('status CHECK constraint', () => {
    it.each(['open', 'under_review', 'awaiting_response', 'resolved', 'closed'])('accepts valid status: %s', (status) => {
      // Ensure no active dispute blocks the insert
      db.prepare("UPDATE disputes SET status = 'resolved' WHERE booking_id = 2 AND status NOT IN ('resolved', 'closed')").run();
      const info = db.prepare(
        'INSERT INTO disputes (booking_id, filed_by, reason, status) VALUES (2, 1, ?, ?)'
      ).run(`Test ${status}`, status);
      expect(info.changes).toBe(1);
      // Clean up: resolve it so the unique index does not block subsequent inserts
      if (!['resolved', 'closed'].includes(status)) {
        db.prepare("UPDATE disputes SET status = 'resolved' WHERE id = ?").run(info.lastInsertRowid);
      }
    });

    it('rejects invalid status', () => {
      expect(() => {
        db.prepare(
          "INSERT INTO disputes (booking_id, filed_by, reason, status) VALUES (2, 1, 'Bad status', 'deleted')"
        ).run();
      }).toThrow();
    });
  });

  // --- Resolution type CHECK constraint ---
  describe('resolution_type CHECK constraint', () => {
    const validTypes = ['full_refund', 'partial_refund', 'credit', 'warning_owner', 'warning_sitter', 'ban_sitter', 'ban_owner', 'no_action'];

    it.each(validTypes)('accepts valid resolution type: %s', (type) => {
      // Resolve existing active on booking 2 if any
      db.prepare("UPDATE disputes SET status = 'resolved' WHERE booking_id = 2 AND status NOT IN ('resolved', 'closed')").run();
      const info = db.prepare(
        'INSERT INTO disputes (booking_id, filed_by, reason, status, resolution_type) VALUES (2, 1, ?, ?, ?)'
      ).run(`Res ${type}`, 'resolved', type);
      expect(info.changes).toBe(1);
    });

    it('rejects invalid resolution type', () => {
      expect(() => {
        db.prepare(
          "INSERT INTO disputes (booking_id, filed_by, reason, status, resolution_type) VALUES (2, 1, 'Bad type', 'resolved', 'slap_on_wrist')"
        ).run();
      }).toThrow();
    });

    it('allows null resolution_type', () => {
      db.prepare("UPDATE disputes SET status = 'resolved' WHERE booking_id = 2 AND status NOT IN ('resolved', 'closed')").run();
      const info = db.prepare(
        "INSERT INTO disputes (booking_id, filed_by, reason, status, resolution_type) VALUES (2, 1, 'No resolution yet', 'closed', NULL)"
      ).run();
      expect(info.changes).toBe(1);
      const row = db.prepare('SELECT resolution_type FROM disputes WHERE id = ?').get(info.lastInsertRowid) as any;
      expect(row.resolution_type).toBeNull();
    });
  });
});
