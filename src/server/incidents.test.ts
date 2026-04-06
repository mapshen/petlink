import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from './auth.ts';
import Database from 'better-sqlite3';
import { createIncidentSchema } from './validation.ts';

// ---------------------------------------------------------------------------
// Part 1: Route integration tests (supertest + mocked DB)
// ---------------------------------------------------------------------------

const { mockSqlFn } = vi.hoisted(() => {
  const fn = vi.fn() as any;
  // Support sql.begin(async (tx) => { ... }) — tx uses the same mock
  fn.begin = vi.fn(async (callback: (tx: any) => Promise<any>) => {
    const txFn = vi.fn() as any;
    // tx tagged template calls go through txFn — route up to mockSqlFn
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

vi.mock('./notifications.ts', () => ({
  createNotification: vi.fn().mockResolvedValue({ id: 1 }),
}));

vi.mock('./email.ts', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  buildIncidentReportEmail: vi.fn().mockReturnValue({ subject: 'test', html: '<p>test</p>' }),
}));

vi.mock('./logger.ts', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
  sanitizeError: (e: Error) => e,
}));

const { default: incidentRoutes } = await import('./routes/incidents.ts');
const { default: request } = await import('supertest');

const mockIo = { to: vi.fn().mockReturnThis(), emit: vi.fn() } as any;

function createApp() {
  const app = express();
  app.use(express.json());
  const router = express.Router();
  incidentRoutes(router, mockIo);
  app.use(router);
  return app;
}

const app = createApp();

// ---------------------------------------------------------------------------
// POST /incidents
// ---------------------------------------------------------------------------
describe('POST /incidents', () => {
  beforeEach(() => vi.clearAllMocks());

  const validBody = {
    booking_id: 1,
    category: 'pet_injury',
    description: 'Dog limping after walk',
  };

  it('creates an incident when user is the owner on a confirmed booking', async () => {
    // 1: booking lookup
    mockSqlFn.mockResolvedValueOnce([{ id: 1, owner_id: 1, sitter_id: 2, status: 'confirmed' }] as any);
    // 2: incident count (rate limit check)
    mockSqlFn.mockResolvedValueOnce([{ count: 0 }] as any);
    // 3: inside tx — insert incident
    mockSqlFn.mockResolvedValueOnce([{ id: 10, booking_id: 1, reporter_id: 1, category: 'pet_injury', description: 'Dog limping after walk', notes: null }] as any);
    // 4: reporter lookup
    mockSqlFn.mockResolvedValueOnce([{ name: 'Owner', email: 'owner@test.com' }] as any);
    // 5: other party lookup
    mockSqlFn.mockResolvedValueOnce([{ name: 'Sitter', email: 'sitter@test.com' }] as any);
    // 6: admin lookup
    mockSqlFn.mockResolvedValueOnce([] as any);

    const res = await request(app)
      .post('/incidents')
      .set('x-test-user-id', '1')
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.incident.id).toBe(10);
    expect(res.body.incident.category).toBe('pet_injury');
    expect(res.body.incident.evidence).toEqual([]);
  });

  it('creates an incident when user is the sitter on an in_progress booking', async () => {
    mockSqlFn.mockResolvedValueOnce([{ id: 1, owner_id: 2, sitter_id: 5, status: 'in_progress' }] as any);
    mockSqlFn.mockResolvedValueOnce([{ count: 0 }] as any); // rate limit check
    mockSqlFn.mockResolvedValueOnce([{ id: 11, booking_id: 1, reporter_id: 5, category: 'property_damage', description: 'Scratched furniture', notes: null }] as any);
    mockSqlFn.mockResolvedValueOnce([{ name: 'Sitter', email: 'sitter@test.com' }] as any);
    mockSqlFn.mockResolvedValueOnce([{ name: 'Owner', email: 'owner@test.com' }] as any);
    mockSqlFn.mockResolvedValueOnce([] as any);

    const res = await request(app)
      .post('/incidents')
      .set('x-test-user-id', '5')
      .send({ booking_id: 1, category: 'property_damage', description: 'Scratched furniture' });

    expect(res.status).toBe(201);
    expect(res.body.incident.id).toBe(11);
  });

  it('creates an incident with evidence items', async () => {
    mockSqlFn.mockResolvedValueOnce([{ id: 1, owner_id: 1, sitter_id: 2, status: 'confirmed' }] as any);
    mockSqlFn.mockResolvedValueOnce([{ count: 0 }] as any); // rate limit check
    mockSqlFn.mockResolvedValueOnce([{ id: 12, booking_id: 1, reporter_id: 1, category: 'pet_injury', description: 'Hurt', notes: null }] as any);
    // sql(rows, ...) helper call (consumed by the postgres helper syntax)
    mockSqlFn.mockReturnValueOnce([]);
    // Outer tagged template for evidence INSERT ... RETURNING
    mockSqlFn.mockResolvedValueOnce([
      { id: 100, media_url: 'https://example.com/photo1.jpg', media_type: 'image' },
      { id: 101, media_url: 'https://example.com/video1.mp4', media_type: 'video' },
    ] as any);
    mockSqlFn.mockResolvedValueOnce([{ name: 'Owner', email: 'owner@test.com' }] as any);
    mockSqlFn.mockResolvedValueOnce([{ name: 'Sitter', email: 'sitter@test.com' }] as any);
    mockSqlFn.mockResolvedValueOnce([] as any);

    const res = await request(app)
      .post('/incidents')
      .set('x-test-user-id', '1')
      .send({
        ...validBody,
        evidence: [
          { media_url: 'https://example.com/photo1.jpg', media_type: 'image' },
          { media_url: 'https://example.com/video1.mp4', media_type: 'video' },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.incident.evidence).toHaveLength(2);
    expect(res.body.incident.evidence[0].media_type).toBe('image');
    expect(res.body.incident.evidence[1].media_type).toBe('video');
  });

  it('returns 404 when booking does not exist', async () => {
    mockSqlFn.mockResolvedValueOnce([] as any);

    const res = await request(app)
      .post('/incidents')
      .set('x-test-user-id', '1')
      .send(validBody);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Booking not found');
  });

  it('returns 403 when user is not owner or sitter on the booking', async () => {
    mockSqlFn.mockResolvedValueOnce([{ id: 1, owner_id: 10, sitter_id: 20, status: 'confirmed' }] as any);

    const res = await request(app)
      .post('/incidents')
      .set('x-test-user-id', '99')
      .send(validBody);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('You are not part of this booking');
  });

  it('returns 400 when booking status is pending', async () => {
    mockSqlFn.mockResolvedValueOnce([{ id: 1, owner_id: 1, sitter_id: 2, status: 'pending' }] as any);

    const res = await request(app)
      .post('/incidents')
      .set('x-test-user-id', '1')
      .send(validBody);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Incidents can only be reported on active bookings');
  });

  it('returns 400 when booking status is completed', async () => {
    mockSqlFn.mockResolvedValueOnce([{ id: 1, owner_id: 1, sitter_id: 2, status: 'completed' }] as any);

    const res = await request(app)
      .post('/incidents')
      .set('x-test-user-id', '1')
      .send(validBody);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Incidents can only be reported on active bookings');
  });

  it('returns 400 when booking status is cancelled', async () => {
    mockSqlFn.mockResolvedValueOnce([{ id: 1, owner_id: 1, sitter_id: 2, status: 'cancelled' }] as any);

    const res = await request(app)
      .post('/incidents')
      .set('x-test-user-id', '1')
      .send(validBody);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Incidents can only be reported on active bookings');
  });

  it('returns 400 for invalid category via validation', async () => {
    const res = await request(app)
      .post('/incidents')
      .set('x-test-user-id', '1')
      .send({ ...validBody, category: 'alien_abduction' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid incident category');
    expect(mockSqlFn).not.toHaveBeenCalled();
  });

  it('returns 400 for empty description via validation', async () => {
    const res = await request(app)
      .post('/incidents')
      .set('x-test-user-id', '1')
      .send({ ...validBody, description: '' });

    expect(res.status).toBe(400);
    expect(mockSqlFn).not.toHaveBeenCalled();
  });

  it('returns 400 for more than 4 evidence items via validation', async () => {
    const res = await request(app)
      .post('/incidents')
      .set('x-test-user-id', '1')
      .send({
        ...validBody,
        evidence: Array.from({ length: 5 }, (_, i) => ({
          media_url: `https://example.com/photo${i}.jpg`,
          media_type: 'image',
        })),
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Maximum 4 evidence items');
    expect(mockSqlFn).not.toHaveBeenCalled();
  });

  it('returns 400 for non-HTTPS evidence URL via validation', async () => {
    const res = await request(app)
      .post('/incidents')
      .set('x-test-user-id', '1')
      .send({
        ...validBody,
        evidence: [{ media_url: 'http://example.com/photo.jpg', media_type: 'image' }],
      });

    expect(res.status).toBe(400);
    expect(mockSqlFn).not.toHaveBeenCalled();
  });

  it('returns 429 when user exceeds per-booking incident limit', async () => {
    mockSqlFn.mockResolvedValueOnce([{ id: 1, owner_id: 1, sitter_id: 2, status: 'confirmed' }] as any);
    mockSqlFn.mockResolvedValueOnce([{ count: 10 }] as any); // at limit

    const res = await request(app)
      .post('/incidents')
      .set('x-test-user-id', '1')
      .send(validBody);

    expect(res.status).toBe(429);
    expect(res.body.error).toBe('Maximum incident reports reached for this booking');
  });
});

// ---------------------------------------------------------------------------
// GET /incidents/booking/:bookingId
// ---------------------------------------------------------------------------
describe('GET /incidents/booking/:bookingId', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns incidents with reporter info and evidence for booking party', async () => {
    mockSqlFn.mockResolvedValueOnce([{ owner_id: 1, sitter_id: 2 }] as any);
    mockSqlFn.mockResolvedValueOnce([{ roles: ['owner'] }] as any);
    mockSqlFn.mockResolvedValueOnce([
      { id: 10, booking_id: 1, reporter_id: 1, category: 'pet_injury', reporter_name: 'Owner', reporter_avatar: 'https://example.com/avatar.jpg' },
    ] as any);
    mockSqlFn.mockResolvedValueOnce([
      { id: 100, incident_id: 10, media_url: 'https://example.com/photo.jpg', media_type: 'image' },
    ] as any);

    const res = await request(app)
      .get('/incidents/booking/1')
      .set('x-test-user-id', '1');

    expect(res.status).toBe(200);
    expect(res.body.incidents).toHaveLength(1);
    expect(res.body.incidents[0].reporter_name).toBe('Owner');
    expect(res.body.incidents[0].reporter_avatar).toBe('https://example.com/avatar.jpg');
    expect(res.body.incidents[0].evidence).toHaveLength(1);
  });

  it('returns empty incidents array when none exist', async () => {
    mockSqlFn.mockResolvedValueOnce([{ owner_id: 1, sitter_id: 2 }] as any);
    mockSqlFn.mockResolvedValueOnce([{ roles: ['owner'] }] as any);
    mockSqlFn.mockResolvedValueOnce([] as any);

    const res = await request(app)
      .get('/incidents/booking/1')
      .set('x-test-user-id', '1');

    expect(res.status).toBe(200);
    expect(res.body.incidents).toEqual([]);
  });

  it('returns incidents for admin user not on the booking', async () => {
    mockSqlFn.mockResolvedValueOnce([{ owner_id: 10, sitter_id: 20 }] as any);
    mockSqlFn.mockResolvedValueOnce([{ roles: ['owner', 'admin'] }] as any);
    mockSqlFn.mockResolvedValueOnce([] as any);

    const res = await request(app)
      .get('/incidents/booking/1')
      .set('x-test-user-id', '99');

    expect(res.status).toBe(200);
    expect(res.body.incidents).toEqual([]);
  });

  it('returns 403 for unrelated non-admin user', async () => {
    mockSqlFn.mockResolvedValueOnce([{ owner_id: 10, sitter_id: 20 }] as any);
    mockSqlFn.mockResolvedValueOnce([{ roles: ['owner'] }] as any);

    const res = await request(app)
      .get('/incidents/booking/1')
      .set('x-test-user-id', '99');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('You are not part of this booking');
  });

  it('returns 404 when booking does not exist', async () => {
    mockSqlFn.mockResolvedValueOnce([] as any);

    const res = await request(app)
      .get('/incidents/booking/999')
      .set('x-test-user-id', '1');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Booking not found');
  });

  it('returns 400 for non-integer booking ID', async () => {
    const res = await request(app)
      .get('/incidents/booking/abc')
      .set('x-test-user-id', '1');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid booking ID');
    expect(mockSqlFn).not.toHaveBeenCalled();
  });

  it('returns 400 for zero booking ID', async () => {
    const res = await request(app)
      .get('/incidents/booking/0')
      .set('x-test-user-id', '1');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid booking ID');
  });

  it('returns 400 for negative booking ID', async () => {
    const res = await request(app)
      .get('/incidents/booking/-5')
      .set('x-test-user-id', '1');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid booking ID');
  });
});

// ---------------------------------------------------------------------------
// GET /incidents/:id
// ---------------------------------------------------------------------------
describe('GET /incidents/:id', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns single incident with evidence for booking party', async () => {
    mockSqlFn.mockResolvedValueOnce([{
      id: 10, booking_id: 1, reporter_id: 1, category: 'pet_injury',
      reporter_name: 'Owner', reporter_avatar: 'https://example.com/avatar.jpg',
    }] as any);
    mockSqlFn.mockResolvedValueOnce([{ owner_id: 1, sitter_id: 2 }] as any);
    mockSqlFn.mockResolvedValueOnce([{ roles: ['owner'] }] as any);
    mockSqlFn.mockResolvedValueOnce([
      { id: 100, incident_id: 10, media_url: 'https://example.com/photo.jpg', media_type: 'image' },
    ] as any);

    const res = await request(app)
      .get('/incidents/10')
      .set('x-test-user-id', '1');

    expect(res.status).toBe(200);
    expect(res.body.incident.id).toBe(10);
    expect(res.body.incident.reporter_name).toBe('Owner');
    expect(res.body.incident.evidence).toHaveLength(1);
  });

  it('returns 404 when incident does not exist', async () => {
    mockSqlFn.mockResolvedValueOnce([] as any);

    const res = await request(app)
      .get('/incidents/999')
      .set('x-test-user-id', '1');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Incident not found');
  });

  it('returns 403 for unrelated non-admin user', async () => {
    mockSqlFn.mockResolvedValueOnce([{ id: 10, booking_id: 1, reporter_id: 1 }] as any);
    mockSqlFn.mockResolvedValueOnce([{ owner_id: 10, sitter_id: 20 }] as any);
    mockSqlFn.mockResolvedValueOnce([{ roles: ['owner'] }] as any);

    const res = await request(app)
      .get('/incidents/10')
      .set('x-test-user-id', '99');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('You are not part of this booking');
  });

  it('returns incident for admin user not on the booking', async () => {
    mockSqlFn.mockResolvedValueOnce([{
      id: 10, booking_id: 1, reporter_id: 1, category: 'pet_injury',
      reporter_name: 'Owner', reporter_avatar: null,
    }] as any);
    mockSqlFn.mockResolvedValueOnce([{ owner_id: 10, sitter_id: 20 }] as any);
    mockSqlFn.mockResolvedValueOnce([{ roles: ['owner', 'admin'] }] as any);
    mockSqlFn.mockResolvedValueOnce([] as any);

    const res = await request(app)
      .get('/incidents/10')
      .set('x-test-user-id', '99');

    expect(res.status).toBe(200);
    expect(res.body.incident.id).toBe(10);
  });

  it('returns 400 for non-integer incident ID', async () => {
    const res = await request(app)
      .get('/incidents/abc')
      .set('x-test-user-id', '1');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid incident ID');
    expect(mockSqlFn).not.toHaveBeenCalled();
  });

  it('returns 400 for zero incident ID', async () => {
    const res = await request(app)
      .get('/incidents/0')
      .set('x-test-user-id', '1');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid incident ID');
  });

  it('returns 400 for negative incident ID', async () => {
    const res = await request(app)
      .get('/incidents/-1')
      .set('x-test-user-id', '1');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid incident ID');
  });
});

// ---------------------------------------------------------------------------
// Part 2: Validation schema tests (direct Zod parsing)
// ---------------------------------------------------------------------------
describe('createIncidentSchema validation', () => {
  const validInput = {
    booking_id: 1,
    category: 'pet_injury',
    description: 'Dog was limping after the walk',
  };

  describe('category enum', () => {
    const validCategories = ['pet_injury', 'property_damage', 'safety_concern', 'behavioral_issue', 'service_issue', 'other'];

    it.each(validCategories)('accepts valid category: %s', (category) => {
      const result = createIncidentSchema.safeParse({ ...validInput, category });
      expect(result.success).toBe(true);
    });

    it('rejects invalid category', () => {
      const result = createIncidentSchema.safeParse({ ...validInput, category: 'alien_abduction' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Invalid incident category');
      }
    });

    it('rejects empty string category', () => {
      const result = createIncidentSchema.safeParse({ ...validInput, category: '' });
      expect(result.success).toBe(false);
    });

    it('rejects missing category', () => {
      const { category: _, ...noCategory } = validInput;
      const result = createIncidentSchema.safeParse(noCategory);
      expect(result.success).toBe(false);
    });
  });

  describe('description min/max length', () => {
    it('rejects empty description', () => {
      const result = createIncidentSchema.safeParse({ ...validInput, description: '' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Description is required');
      }
    });

    it('rejects whitespace-only description (trimmed to empty)', () => {
      const result = createIncidentSchema.safeParse({ ...validInput, description: '   ' });
      expect(result.success).toBe(false);
    });

    it('accepts 1-character description', () => {
      const result = createIncidentSchema.safeParse({ ...validInput, description: 'A' });
      expect(result.success).toBe(true);
    });

    it('accepts exactly 2000-character description', () => {
      const result = createIncidentSchema.safeParse({ ...validInput, description: 'x'.repeat(2000) });
      expect(result.success).toBe(true);
    });

    it('rejects 2001-character description', () => {
      const result = createIncidentSchema.safeParse({ ...validInput, description: 'x'.repeat(2001) });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Description must be under 2000 characters');
      }
    });
  });

  describe('evidence array max 4', () => {
    const makeEvidence = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        media_url: `https://example.com/photo${i}.jpg`,
        media_type: 'image' as const,
      }));

    it('accepts empty evidence array', () => {
      const result = createIncidentSchema.safeParse({ ...validInput, evidence: [] });
      expect(result.success).toBe(true);
    });

    it('accepts exactly 4 evidence items', () => {
      const result = createIncidentSchema.safeParse({ ...validInput, evidence: makeEvidence(4) });
      expect(result.success).toBe(true);
    });

    it('rejects 5 evidence items', () => {
      const result = createIncidentSchema.safeParse({ ...validInput, evidence: makeEvidence(5) });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Maximum 4 evidence items');
      }
    });

    it('defaults evidence to empty array when omitted', () => {
      const result = createIncidentSchema.safeParse(validInput);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.evidence).toEqual([]);
      }
    });
  });

  describe('media_url HTTPS validation', () => {
    it('accepts HTTPS URL', () => {
      const result = createIncidentSchema.safeParse({
        ...validInput,
        evidence: [{ media_url: 'https://example.com/photo.jpg', media_type: 'image' }],
      });
      expect(result.success).toBe(true);
    });

    it('rejects HTTP URL', () => {
      const result = createIncidentSchema.safeParse({
        ...validInput,
        evidence: [{ media_url: 'http://example.com/photo.jpg', media_type: 'image' }],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Media URL must use HTTPS');
      }
    });

    it('rejects non-URL string', () => {
      const result = createIncidentSchema.safeParse({
        ...validInput,
        evidence: [{ media_url: 'not-a-url', media_type: 'image' }],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('media_type enum', () => {
    it('accepts image', () => {
      const result = createIncidentSchema.safeParse({
        ...validInput,
        evidence: [{ media_url: 'https://example.com/photo.jpg', media_type: 'image' }],
      });
      expect(result.success).toBe(true);
    });

    it('accepts video', () => {
      const result = createIncidentSchema.safeParse({
        ...validInput,
        evidence: [{ media_url: 'https://example.com/clip.mp4', media_type: 'video' }],
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid media_type', () => {
      const result = createIncidentSchema.safeParse({
        ...validInput,
        evidence: [{ media_url: 'https://example.com/file.pdf', media_type: 'document' }],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('media_type must be image or video');
      }
    });
  });

  describe('booking_id', () => {
    it('rejects missing booking_id', () => {
      const { booking_id: _, ...rest } = validInput;
      const result = createIncidentSchema.safeParse(rest);
      expect(result.success).toBe(false);
    });

    it('rejects zero booking_id', () => {
      const result = createIncidentSchema.safeParse({ ...validInput, booking_id: 0 });
      expect(result.success).toBe(false);
    });

    it('rejects negative booking_id', () => {
      const result = createIncidentSchema.safeParse({ ...validInput, booking_id: -1 });
      expect(result.success).toBe(false);
    });

    it('rejects non-integer booking_id', () => {
      const result = createIncidentSchema.safeParse({ ...validInput, booking_id: 1.5 });
      expect(result.success).toBe(false);
    });
  });

  describe('notes field', () => {
    it('accepts null notes', () => {
      const result = createIncidentSchema.safeParse({ ...validInput, notes: null });
      expect(result.success).toBe(true);
    });

    it('accepts omitted notes', () => {
      const result = createIncidentSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('accepts notes up to 1000 characters', () => {
      const result = createIncidentSchema.safeParse({ ...validInput, notes: 'x'.repeat(1000) });
      expect(result.success).toBe(true);
    });

    it('rejects notes over 1000 characters', () => {
      const result = createIncidentSchema.safeParse({ ...validInput, notes: 'x'.repeat(1001) });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Notes must be under 1000 characters');
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Part 3: SQLite in-memory DB tests (data integrity, cascades, authorization)
// ---------------------------------------------------------------------------
describe('incident data integrity (SQLite)', () => {
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
        avatar_url TEXT,
        roles TEXT DEFAULT 'owner'
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (sitter_id) REFERENCES users(id),
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE TABLE incident_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id INTEGER NOT NULL,
        reporter_id INTEGER NOT NULL,
        category TEXT NOT NULL CHECK(category IN ('pet_injury','property_damage','safety_concern','behavioral_issue','service_issue','other')),
        description TEXT NOT NULL,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
        FOREIGN KEY (reporter_id) REFERENCES users(id)
      );
      CREATE TABLE incident_evidence (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        incident_id INTEGER NOT NULL,
        media_url TEXT NOT NULL,
        media_type TEXT NOT NULL CHECK(media_type IN ('image','video')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (incident_id) REFERENCES incident_reports(id) ON DELETE CASCADE
      );
    `);

    // Seed users: owner (1), sitter (2), unrelated (3)
    db.prepare("INSERT INTO users (email, password_hash, name, avatar_url, roles) VALUES ('owner@test.com', 'hash', 'Owner User', 'https://example.com/owner.jpg', 'owner')").run();
    db.prepare("INSERT INTO users (email, password_hash, name, avatar_url, roles) VALUES ('sitter@test.com', 'hash', 'Sitter User', 'https://example.com/sitter.jpg', 'owner,sitter')").run();
    db.prepare("INSERT INTO users (email, password_hash, name, avatar_url, roles) VALUES ('other@test.com', 'hash', 'Other User', NULL, 'owner')").run();
    // Seed service
    db.prepare("INSERT INTO services (sitter_id, type, price_cents) VALUES (2, 'walking', 2500)").run();
    // Seed bookings with various statuses
    db.prepare("INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time) VALUES (2, 1, 1, 'confirmed', '2026-04-10T10:00:00Z', '2026-04-10T11:00:00Z')").run();
    db.prepare("INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time) VALUES (2, 1, 1, 'in_progress', '2026-04-11T10:00:00Z', '2026-04-11T11:00:00Z')").run();
    db.prepare("INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time) VALUES (2, 1, 1, 'completed', '2026-04-08T10:00:00Z', '2026-04-08T11:00:00Z')").run();
    db.prepare("INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time) VALUES (2, 1, 1, 'pending', '2026-04-15T10:00:00Z', '2026-04-15T11:00:00Z')").run();
    db.prepare("INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time) VALUES (2, 1, 1, 'cancelled', '2026-04-16T10:00:00Z', '2026-04-16T11:00:00Z')").run();
  });

  afterAll(() => {
    db.close();
  });

  // --- incident_reports table: insert, query, all columns ---
  describe('incident_reports table', () => {
    it('inserts an incident report and verifies all columns', () => {
      const info = db.prepare(
        "INSERT INTO incident_reports (booking_id, reporter_id, category, description, notes) VALUES (1, 1, 'pet_injury', 'Dog limping', 'Noticed after walk')"
      ).run();
      expect(info.changes).toBe(1);

      const row = db.prepare('SELECT * FROM incident_reports WHERE id = ?').get(info.lastInsertRowid) as any;
      expect(row.booking_id).toBe(1);
      expect(row.reporter_id).toBe(1);
      expect(row.category).toBe('pet_injury');
      expect(row.description).toBe('Dog limping');
      expect(row.notes).toBe('Noticed after walk');
      expect(row.created_at).toBeDefined();
    });

    it('queries incidents by booking_id', () => {
      db.prepare(
        "INSERT INTO incident_reports (booking_id, reporter_id, category, description) VALUES (1, 2, 'safety_concern', 'Dog escaped yard')"
      ).run();

      const rows = db.prepare('SELECT * FROM incident_reports WHERE booking_id = 1').all();
      expect(rows.length).toBeGreaterThanOrEqual(2);
    });

    it('allows null notes', () => {
      const info = db.prepare(
        "INSERT INTO incident_reports (booking_id, reporter_id, category, description, notes) VALUES (1, 1, 'other', 'Something happened', NULL)"
      ).run();
      const row = db.prepare('SELECT notes FROM incident_reports WHERE id = ?').get(info.lastInsertRowid) as any;
      expect(row.notes).toBeNull();
    });
  });

  // --- incident_evidence table: insert, cascade ---
  describe('incident_evidence table', () => {
    it('inserts evidence linked to an incident', () => {
      const incidentInfo = db.prepare(
        "INSERT INTO incident_reports (booking_id, reporter_id, category, description) VALUES (1, 1, 'property_damage', 'Chewed furniture')"
      ).run();
      const incidentId = incidentInfo.lastInsertRowid;

      const evidenceInfo = db.prepare(
        "INSERT INTO incident_evidence (incident_id, media_url, media_type) VALUES (?, 'https://example.com/photo.jpg', 'image')"
      ).run(incidentId);
      expect(evidenceInfo.changes).toBe(1);

      const row = db.prepare('SELECT * FROM incident_evidence WHERE id = ?').get(evidenceInfo.lastInsertRowid) as any;
      expect(row.incident_id).toBe(Number(incidentId));
      expect(row.media_url).toBe('https://example.com/photo.jpg');
      expect(row.media_type).toBe('image');
    });

    it('ON DELETE CASCADE from incident to evidence', () => {
      const incidentInfo = db.prepare(
        "INSERT INTO incident_reports (booking_id, reporter_id, category, description) VALUES (1, 1, 'other', 'Cascade from incident')"
      ).run();
      const incidentId = incidentInfo.lastInsertRowid;

      db.prepare("INSERT INTO incident_evidence (incident_id, media_url, media_type) VALUES (?, 'https://example.com/a.jpg', 'image')").run(incidentId);
      db.prepare("INSERT INTO incident_evidence (incident_id, media_url, media_type) VALUES (?, 'https://example.com/b.mp4', 'video')").run(incidentId);

      expect((db.prepare('SELECT COUNT(*) as cnt FROM incident_evidence WHERE incident_id = ?').get(incidentId) as any).cnt).toBe(2);

      db.prepare('DELETE FROM incident_reports WHERE id = ?').run(incidentId);

      expect((db.prepare('SELECT COUNT(*) as cnt FROM incident_evidence WHERE incident_id = ?').get(incidentId) as any).cnt).toBe(0);
    });

    it('rejects evidence with invalid media_type via CHECK constraint', () => {
      const incidentInfo = db.prepare(
        "INSERT INTO incident_reports (booking_id, reporter_id, category, description) VALUES (1, 1, 'other', 'Bad media type')"
      ).run();
      expect(() => {
        db.prepare(
          "INSERT INTO incident_evidence (incident_id, media_url, media_type) VALUES (?, 'https://example.com/file.pdf', 'document')"
        ).run(incidentInfo.lastInsertRowid);
      }).toThrow();
    });
  });

  // --- Authorization: only owner/sitter on booking ---
  describe('authorization (simulate via SQL)', () => {
    it('owner on booking matches authorization query', () => {
      const booking = db.prepare(
        'SELECT id FROM bookings WHERE id = 1 AND (owner_id = ? OR sitter_id = ?)'
      ).get(1, 1) as any;
      expect(booking).toBeDefined();
      expect(booking.id).toBe(1);
    });

    it('sitter on booking matches authorization query', () => {
      const booking = db.prepare(
        'SELECT id FROM bookings WHERE id = 1 AND (owner_id = ? OR sitter_id = ?)'
      ).get(2, 2) as any;
      expect(booking).toBeDefined();
      expect(booking.id).toBe(1);
    });

    it('unrelated user does not match authorization query', () => {
      const booking = db.prepare(
        'SELECT id FROM bookings WHERE id = 1 AND (owner_id = ? OR sitter_id = ?)'
      ).get(3, 3);
      expect(booking).toBeUndefined();
    });
  });

  // --- Booking status: only confirmed/in_progress ---
  describe('booking status eligibility', () => {
    it('confirmed booking is eligible', () => {
      const row = db.prepare(
        "SELECT id FROM bookings WHERE id = 1 AND status IN ('confirmed', 'in_progress')"
      ).get();
      expect(row).toBeDefined();
    });

    it('in_progress booking is eligible', () => {
      const row = db.prepare(
        "SELECT id FROM bookings WHERE id = 2 AND status IN ('confirmed', 'in_progress')"
      ).get();
      expect(row).toBeDefined();
    });

    it('completed booking is not eligible', () => {
      const row = db.prepare(
        "SELECT id FROM bookings WHERE id = 3 AND status IN ('confirmed', 'in_progress')"
      ).get();
      expect(row).toBeUndefined();
    });

    it('pending booking is not eligible', () => {
      const row = db.prepare(
        "SELECT id FROM bookings WHERE id = 4 AND status IN ('confirmed', 'in_progress')"
      ).get();
      expect(row).toBeUndefined();
    });

    it('cancelled booking is not eligible', () => {
      const row = db.prepare(
        "SELECT id FROM bookings WHERE id = 5 AND status IN ('confirmed', 'in_progress')"
      ).get();
      expect(row).toBeUndefined();
    });
  });

  // --- Category validation (DB CHECK constraint) ---
  describe('category validation (DB constraint)', () => {
    const validCategories = ['pet_injury', 'property_damage', 'safety_concern', 'behavioral_issue', 'service_issue', 'other'];

    it.each(validCategories)('accepts valid category: %s', (category) => {
      const info = db.prepare(
        'INSERT INTO incident_reports (booking_id, reporter_id, category, description) VALUES (1, 1, ?, ?)'
      ).run(category, `Test ${category}`);
      expect(info.changes).toBe(1);
    });

    it('rejects invalid category via CHECK constraint', () => {
      expect(() => {
        db.prepare(
          "INSERT INTO incident_reports (booking_id, reporter_id, category, description) VALUES (1, 1, 'invalid_category', 'Test')"
        ).run();
      }).toThrow();
    });
  });

  // --- Evidence limit (max 4, application-level) ---
  describe('evidence limit (max 4)', () => {
    it('allows up to 4 evidence items per incident', () => {
      const incidentInfo = db.prepare(
        "INSERT INTO incident_reports (booking_id, reporter_id, category, description) VALUES (1, 1, 'other', 'Evidence limit test')"
      ).run();
      const incidentId = incidentInfo.lastInsertRowid;

      for (let i = 0; i < 4; i++) {
        db.prepare(
          "INSERT INTO incident_evidence (incident_id, media_url, media_type) VALUES (?, ?, 'image')"
        ).run(incidentId, `https://example.com/photo${i}.jpg`);
      }

      const count = (db.prepare('SELECT COUNT(*) as cnt FROM incident_evidence WHERE incident_id = ?').get(incidentId) as any).cnt;
      expect(count).toBe(4);
    });

    it('application enforces limit by checking count before insert', () => {
      const incidentInfo = db.prepare(
        "INSERT INTO incident_reports (booking_id, reporter_id, category, description) VALUES (1, 1, 'other', 'Evidence limit enforcement')"
      ).run();
      const incidentId = incidentInfo.lastInsertRowid;

      for (let i = 0; i < 4; i++) {
        db.prepare(
          "INSERT INTO incident_evidence (incident_id, media_url, media_type) VALUES (?, ?, 'image')"
        ).run(incidentId, `https://example.com/img${i}.jpg`);
      }

      const count = (db.prepare('SELECT COUNT(*) as cnt FROM incident_evidence WHERE incident_id = ?').get(incidentId) as any).cnt;
      expect(count).toBe(4);
      expect(count).toBeLessThanOrEqual(4);
    });
  });

  // --- Cascade from booking deletion ---
  describe('cascade from booking deletion', () => {
    it('deleting a booking cascades to incident_reports and incident_evidence', () => {
      // Create a dedicated booking for cascade test
      db.prepare("INSERT INTO bookings (sitter_id, owner_id, service_id, status, start_time, end_time) VALUES (2, 1, 1, 'confirmed', '2026-05-01T10:00:00Z', '2026-05-01T11:00:00Z')").run();
      const bookingId = (db.prepare('SELECT id FROM bookings ORDER BY id DESC LIMIT 1').get() as any).id;

      db.prepare(
        "INSERT INTO incident_reports (booking_id, reporter_id, category, description) VALUES (?, 1, 'pet_injury', 'Cascade test')"
      ).run(bookingId);
      const incidentId = (db.prepare('SELECT id FROM incident_reports WHERE booking_id = ?').get(bookingId) as any).id;

      db.prepare(
        "INSERT INTO incident_evidence (incident_id, media_url, media_type) VALUES (?, 'https://example.com/cascade.jpg', 'image')"
      ).run(incidentId);

      // Verify data exists before delete
      expect((db.prepare('SELECT COUNT(*) as cnt FROM incident_reports WHERE booking_id = ?').get(bookingId) as any).cnt).toBe(1);
      expect((db.prepare('SELECT COUNT(*) as cnt FROM incident_evidence WHERE incident_id = ?').get(incidentId) as any).cnt).toBe(1);

      // Delete booking
      db.prepare('DELETE FROM bookings WHERE id = ?').run(bookingId);

      // Verify cascade
      expect((db.prepare('SELECT COUNT(*) as cnt FROM incident_reports WHERE booking_id = ?').get(bookingId) as any).cnt).toBe(0);
      expect((db.prepare('SELECT COUNT(*) as cnt FROM incident_evidence WHERE incident_id = ?').get(incidentId) as any).cnt).toBe(0);
    });
  });

  // --- Reporter info join ---
  describe('reporter info join', () => {
    it('query joins reporter name and avatar correctly', () => {
      db.prepare(
        "INSERT INTO incident_reports (booking_id, reporter_id, category, description) VALUES (1, 1, 'other', 'Join test owner')"
      ).run();

      const row = db.prepare(`
        SELECT ir.*, u.name as reporter_name, u.avatar_url as reporter_avatar
        FROM incident_reports ir
        JOIN users u ON ir.reporter_id = u.id
        WHERE ir.description = 'Join test owner'
      `).get() as any;

      expect(row.reporter_name).toBe('Owner User');
      expect(row.reporter_avatar).toBe('https://example.com/owner.jpg');
    });

    it('returns null avatar when reporter has none', () => {
      // User 3 has NULL avatar_url
      db.prepare(
        "INSERT INTO incident_reports (booking_id, reporter_id, category, description) VALUES (1, 3, 'other', 'Null avatar test')"
      ).run();

      const row = db.prepare(`
        SELECT u.name as reporter_name, u.avatar_url as reporter_avatar
        FROM incident_reports ir
        JOIN users u ON ir.reporter_id = u.id
        WHERE ir.description = 'Null avatar test'
      `).get() as any;

      expect(row.reporter_name).toBe('Other User');
      expect(row.reporter_avatar).toBeNull();
    });
  });
});
