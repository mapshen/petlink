import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSql: any = vi.fn();
mockSql.begin = vi.fn((fn: any) => fn(mockSql));
vi.mock('./db.ts', () => ({ default: mockSql }));
vi.mock('./logger.ts', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  sanitizeError: (e: unknown) => e,
}));

describe('campaign constants', () => {
  it('limits campaigns to 2 per month', async () => {
    const { MAX_CAMPAIGNS_PER_MONTH } = await import('./campaigns.ts');
    expect(MAX_CAMPAIGNS_PER_MONTH).toBe(2);
  });

  it('limits subject to 200 chars', async () => {
    const { MAX_SUBJECT_LENGTH } = await import('./campaigns.ts');
    expect(MAX_SUBJECT_LENGTH).toBe(200);
  });

  it('limits body to 5000 chars', async () => {
    const { MAX_BODY_LENGTH } = await import('./campaigns.ts');
    expect(MAX_BODY_LENGTH).toBe(5000);
  });
});

describe('HOLIDAY_TEMPLATES', () => {
  it('has at least 5 templates', async () => {
    const { HOLIDAY_TEMPLATES } = await import('./campaigns.ts');
    expect(HOLIDAY_TEMPLATES.length).toBeGreaterThanOrEqual(5);
  });

  it('each template has required fields', async () => {
    const { HOLIDAY_TEMPLATES } = await import('./campaigns.ts');
    for (const t of HOLIDAY_TEMPLATES) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.defaultSubject).toBeTruthy();
      expect(t.defaultBody).toBeTruthy();
    }
  });
});

describe('canSendCampaign', () => {
  beforeEach(() => vi.clearAllMocks());

  it('allows when under limit', async () => {
    mockSql.mockResolvedValueOnce([{ count: 0 }]);
    const { canSendCampaign } = await import('./campaigns.ts');
    const result = await canSendCampaign(1);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it('blocks when at limit', async () => {
    mockSql.mockResolvedValueOnce([{ count: 2 }]);
    const { canSendCampaign } = await import('./campaigns.ts');
    const result = await canSendCampaign(1);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});

describe('createCampaign', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates a draft campaign', async () => {
    const fakeCampaign = { id: 1, sitter_id: 1, type: 'marketing', status: 'draft', subject: 'Test', body: 'Body' };
    mockSql.mockResolvedValueOnce([fakeCampaign]);
    const { createCampaign } = await import('./campaigns.ts');
    const result = await createCampaign({
      sitter_id: 1,
      type: 'marketing',
      subject: 'Test',
      body: 'Body',
      audience: 'all_clients',
    });
    expect(result.status).toBe('draft');
  });
});

describe('sendCampaign', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects non-existent campaign', async () => {
    mockSql.mockResolvedValueOnce([]); // campaign not found
    const { sendCampaign } = await import('./campaigns.ts');
    const result = await sendCampaign(999, 1);
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('rejects already-sent campaign', async () => {
    mockSql.mockResolvedValueOnce([{ id: 1, sitter_id: 1, status: 'sent', audience: 'all_clients' }]);
    const { sendCampaign } = await import('./campaigns.ts');
    const result = await sendCampaign(1, 1);
    expect(result.success).toBe(false);
    expect(result.error).toContain('already been sent');
  });

  it('rejects when monthly limit reached', async () => {
    // Flow: fetch campaign -> getClients (sql fragments) -> sql.begin (limit inside tx)
    mockSql.mockResolvedValueOnce([{ id: 1, sitter_id: 1, status: 'draft', audience: 'all_clients' }]);
    mockSql.mockResolvedValue([{ id: 10, name: 'Alice', email: 'a@test.com' }]);
    mockSql.begin = vi.fn().mockRejectedValueOnce(new Error('Monthly campaign limit (2) reached'));
    const { sendCampaign } = await import('./campaigns.ts');
    const result = await sendCampaign(1, 1);
    expect(result.success).toBe(false);
    expect(result.error).toContain('limit');
    mockSql.begin = vi.fn((fn: any) => fn(mockSql));
  });

  it('rejects when no recipients found', async () => {
    // getClients uses sql fragment interpolation; mockResolvedValue covers all calls
    mockSql
      .mockResolvedValueOnce([{ id: 1, sitter_id: 1, status: 'draft', audience: 'all_clients' }])
      .mockResolvedValueOnce([{ count: 0 }]) // limit check
      .mockResolvedValue([]); // getClients returns empty (fragments make call count unpredictable)
    const { sendCampaign } = await import('./campaigns.ts');
    const result = await sendCampaign(1, 1);
    expect(result.success).toBe(false);
    expect(result.error).toContain('No recipients');
  });
});

describe('getClients', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns client list', async () => {
    mockSql.mockResolvedValue([{ id: 10, name: 'Alice', email: 'alice@test.com' }]);
    const { getClients } = await import('./campaigns.ts');
    const clients = await getClients(1, 'all_clients');
    expect(Array.isArray(clients)).toBe(true);
    expect(clients.length).toBeGreaterThanOrEqual(0);
  });
});
