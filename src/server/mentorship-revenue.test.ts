import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSql: any = vi.fn();
mockSql.begin = vi.fn();
vi.mock('./db.ts', () => ({ default: mockSql }));
vi.mock('./logger.ts', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  sanitizeError: (e: unknown) => e,
}));
vi.mock('./credits.ts', () => ({
  issueCredit: vi.fn(),
}));

describe('mentorship-revenue constants', () => {
  it('enforces share percentage bounds', async () => {
    const { MAX_SHARE_PERCENTAGE, MIN_SHARE_PERCENTAGE } = await import('./mentorship-revenue.ts');
    expect(MAX_SHARE_PERCENTAGE).toBe(15);
    expect(MIN_SHARE_PERCENTAGE).toBe(1);
  });

  it('enforces duration bounds', async () => {
    const { MAX_DURATION_MONTHS, MIN_DURATION_MONTHS } = await import('./mentorship-revenue.ts');
    expect(MAX_DURATION_MONTHS).toBe(12);
    expect(MIN_DURATION_MONTHS).toBe(1);
  });
});

describe('proposeAgreement', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects if mentorship not found', async () => {
    mockSql.mockResolvedValueOnce([]);
    const { proposeAgreement } = await import('./mentorship-revenue.ts');
    const result = await proposeAgreement(999, 1, 5, 6);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('rejects if mentorship is not active', async () => {
    mockSql.mockResolvedValueOnce([{ id: 1, mentor_id: 1, mentee_id: 2, status: 'completed' }]);
    const { proposeAgreement } = await import('./mentorship-revenue.ts');
    const result = await proposeAgreement(1, 1, 5, 6);
    expect(result.success).toBe(false);
    expect(result.error).toContain('active');
  });

  it('rejects if caller is not the mentor', async () => {
    mockSql.mockResolvedValueOnce([{ id: 1, mentor_id: 1, mentee_id: 2, status: 'active' }]);
    const { proposeAgreement } = await import('./mentorship-revenue.ts');
    const result = await proposeAgreement(1, 99, 5, 6);
    expect(result.success).toBe(false);
    expect(result.error).toContain('mentor');
  });

  it('rejects share percentage outside bounds', async () => {
    mockSql.mockResolvedValueOnce([{ id: 1, mentor_id: 1, mentee_id: 2, status: 'active' }]);
    mockSql.mockResolvedValueOnce([]); // no existing agreement
    const { proposeAgreement } = await import('./mentorship-revenue.ts');
    const result = await proposeAgreement(1, 1, 20, 6);
    expect(result.success).toBe(false);
    expect(result.error).toContain('percentage');
  });

  it('rejects duration outside bounds', async () => {
    mockSql.mockResolvedValueOnce([{ id: 1, mentor_id: 1, mentee_id: 2, status: 'active' }]);
    mockSql.mockResolvedValueOnce([]);
    const { proposeAgreement } = await import('./mentorship-revenue.ts');
    const result = await proposeAgreement(1, 1, 5, 18);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Duration');
  });

  it('rejects if active agreement already exists', async () => {
    mockSql.mockResolvedValueOnce([{ id: 1, mentor_id: 1, mentee_id: 2, status: 'active' }]);
    mockSql.mockResolvedValueOnce([{ id: 10 }]); // existing active agreement
    const { proposeAgreement } = await import('./mentorship-revenue.ts');
    const result = await proposeAgreement(1, 1, 5, 6);
    expect(result.success).toBe(false);
    expect(result.error).toContain('already exists');
  });

  it('creates agreement on valid input', async () => {
    const fakeAgreement = { id: 1, mentorship_id: 1, mentor_id: 1, mentee_id: 2, share_percentage: 5, duration_months: 6, status: 'pending' };
    mockSql.mockResolvedValueOnce([{ id: 1, mentor_id: 1, mentee_id: 2, status: 'active' }]);
    mockSql.mockResolvedValueOnce([]); // no existing
    mockSql.mockResolvedValueOnce([fakeAgreement]); // insert
    const { proposeAgreement } = await import('./mentorship-revenue.ts');
    const result = await proposeAgreement(1, 1, 5, 6);
    expect(result.success).toBe(true);
    expect(result.agreement?.share_percentage).toBe(5);
  });
});

describe('acceptAgreement', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects if not the mentee', async () => {
    mockSql.mockResolvedValueOnce([{ id: 1, mentee_id: 2, status: 'pending' }]);
    const { acceptAgreement } = await import('./mentorship-revenue.ts');
    const result = await acceptAgreement(1, 99);
    expect(result.success).toBe(false);
    expect(result.error).toContain('mentee');
  });

  it('rejects if not pending', async () => {
    mockSql.mockResolvedValueOnce([{ id: 1, mentee_id: 2, status: 'active' }]);
    const { acceptAgreement } = await import('./mentorship-revenue.ts');
    const result = await acceptAgreement(1, 2);
    expect(result.success).toBe(false);
    expect(result.error).toContain('pending');
  });

  it('activates the agreement', async () => {
    mockSql.mockResolvedValueOnce([{ id: 1, mentee_id: 2, status: 'pending', duration_months: 6 }]);
    mockSql.mockResolvedValueOnce([{ id: 1, status: 'active', started_at: '2026-04-07' }]);
    const { acceptAgreement } = await import('./mentorship-revenue.ts');
    const result = await acceptAgreement(1, 2);
    expect(result.success).toBe(true);
    expect(result.agreement?.status).toBe('active');
  });
});

describe('cancelAgreement', () => {
  beforeEach(() => vi.clearAllMocks());

  it('allows mentee to cancel', async () => {
    mockSql.mockResolvedValueOnce([{ id: 1, mentor_id: 1, mentee_id: 2, status: 'active' }]);
    mockSql.mockResolvedValueOnce({ count: 1 });
    const { cancelAgreement } = await import('./mentorship-revenue.ts');
    const result = await cancelAgreement(1, 2);
    expect(result.success).toBe(true);
  });

  it('rejects non-party cancellation', async () => {
    mockSql.mockResolvedValueOnce([{ id: 1, mentor_id: 1, mentee_id: 2, status: 'active' }]);
    const { cancelAgreement } = await import('./mentorship-revenue.ts');
    const result = await cancelAgreement(1, 99);
    expect(result.success).toBe(false);
  });
});

describe('applyRevenueSplit', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns full amount when no active agreement', async () => {
    mockSql.mockResolvedValueOnce([]); // no agreement
    const { applyRevenueSplit } = await import('./mentorship-revenue.ts');
    const result = await applyRevenueSplit(2, 100, 10000);
    expect(result.menteeAmount).toBe(10000);
    expect(result.mentorAmount).toBe(0);
    expect(result.agreementId).toBeNull();
  });

  it('splits correctly with 5% share', async () => {
    mockSql.mockResolvedValueOnce([{ id: 1, share_percentage: 5, min_earnings_cents: 0 }]);
    mockSql.mockResolvedValueOnce([{ id: 1 }]); // insert payout
    const { applyRevenueSplit } = await import('./mentorship-revenue.ts');
    const result = await applyRevenueSplit(2, 100, 10000);
    expect(result.mentorAmount).toBe(500);
    expect(result.menteeAmount).toBe(9500);
    expect(result.agreementId).toBe(1);
  });

  it('splits correctly with 15% share', async () => {
    mockSql.mockResolvedValueOnce([{ id: 1, share_percentage: 15, min_earnings_cents: 0 }]);
    mockSql.mockResolvedValueOnce([{ id: 1 }]);
    const { applyRevenueSplit } = await import('./mentorship-revenue.ts');
    const result = await applyRevenueSplit(2, 101, 10000);
    expect(result.mentorAmount).toBe(1500);
    expect(result.menteeAmount).toBe(8500);
  });

  it('skips split when below min earnings threshold', async () => {
    mockSql.mockResolvedValueOnce([{ id: 1, share_percentage: 5, min_earnings_cents: 50000 }]);
    mockSql.mockResolvedValueOnce([{ total: 10000 }]); // only $100 earned so far
    const { applyRevenueSplit } = await import('./mentorship-revenue.ts');
    const result = await applyRevenueSplit(2, 102, 10000);
    expect(result.menteeAmount).toBe(10000);
    expect(result.mentorAmount).toBe(0);
  });
});

describe('getMentorshipEarnings', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns structured response', async () => {
    // sql`` template tag with embedded fragments is hard to mock precisely.
    // Test the return shape by returning consistent mocks.
    mockSql.mockResolvedValue([{ total: 0 }]);
    const { getMentorshipEarnings } = await import('./mentorship-revenue.ts');
    const result = await getMentorshipEarnings(1);
    expect(typeof result.total_earned_as_mentor).toBe('number');
    expect(typeof result.total_shared_as_mentee).toBe('number');
    expect(Array.isArray(result.payouts)).toBe(true);
  });
});
