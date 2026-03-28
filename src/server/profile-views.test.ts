import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the database module
const mockSql = Object.assign(
  vi.fn(),
  {
    begin: vi.fn(),
    end: vi.fn(),
  },
);

vi.mock('./db.ts', () => ({
  default: mockSql,
}));

// Import after mocking
const { recordProfileView, getProfileViewsAnalytics, getProfileViewsCount } = await import('./profile-views.ts');

describe('recordProfileView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts a view when sitter exists and no session_id', async () => {
    // First call: sitter lookup
    mockSql.mockResolvedValueOnce([{ id: 1 }]);
    // Second call: insert
    mockSql.mockResolvedValueOnce([]);

    const result = await recordProfileView(1, 'search');
    expect(result).toBe(true);
    expect(mockSql).toHaveBeenCalledTimes(2);
  });

  it('returns false when sitter does not exist', async () => {
    mockSql.mockResolvedValueOnce([]);

    const result = await recordProfileView(999, 'direct');
    expect(result).toBe(false);
    expect(mockSql).toHaveBeenCalledTimes(1);
  });

  it('deduplicates by session_id within 24h', async () => {
    // Sitter exists
    mockSql.mockResolvedValueOnce([{ id: 1 }]);
    // Existing view found
    mockSql.mockResolvedValueOnce([{ id: 42 }]);

    const result = await recordProfileView(1, 'search', 'session-abc');
    expect(result).toBe(true);
    // Should NOT call insert (only 2 calls: sitter lookup + dedup check)
    expect(mockSql).toHaveBeenCalledTimes(2);
  });

  it('inserts when session_id exists but no recent duplicate', async () => {
    // Sitter exists
    mockSql.mockResolvedValueOnce([{ id: 1 }]);
    // No existing view
    mockSql.mockResolvedValueOnce([]);
    // Insert
    mockSql.mockResolvedValueOnce([]);

    const result = await recordProfileView(1, 'favorites', 'session-new');
    expect(result).toBe(true);
    expect(mockSql).toHaveBeenCalledTimes(3);
  });

  it('normalizes invalid source to direct', async () => {
    mockSql.mockResolvedValueOnce([{ id: 1 }]);
    mockSql.mockResolvedValueOnce([]);

    const result = await recordProfileView(1, 'invalid_source');
    expect(result).toBe(true);
    expect(mockSql).toHaveBeenCalledTimes(2);
  });

  it('defaults source to direct when undefined', async () => {
    mockSql.mockResolvedValueOnce([{ id: 1 }]);
    mockSql.mockResolvedValueOnce([]);

    const result = await recordProfileView(1);
    expect(result).toBe(true);
  });
});

describe('getProfileViewsAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns total views and views by source for non-Pro users', async () => {
    // Total views
    mockSql.mockResolvedValueOnce([{ total_views: 42 }]);
    // Views by source
    mockSql.mockResolvedValueOnce([
      { source: 'search', count: 30 },
      { source: 'direct', count: 12 },
    ]);

    const result = await getProfileViewsAnalytics(1, '2026-01-01', '2026-04-01', false);
    expect(result.total_views).toBe(42);
    expect(result.views_by_source).toEqual([
      { source: 'search', count: 30 },
      { source: 'direct', count: 12 },
    ]);
    expect(result.views_by_day).toEqual([]);
    // Non-Pro: 2 queries (total + by_source), no daily query
    expect(mockSql).toHaveBeenCalledTimes(2);
  });

  it('returns daily breakdown for Pro users', async () => {
    // Total views
    mockSql.mockResolvedValueOnce([{ total_views: 5 }]);
    // Views by source
    mockSql.mockResolvedValueOnce([{ source: 'direct', count: 5 }]);
    // Views by day
    mockSql.mockResolvedValueOnce([
      { date: '2026-03-25', count: 2 },
      { date: '2026-03-26', count: 3 },
    ]);

    const result = await getProfileViewsAnalytics(1, '2026-03-01', '2026-04-01', true);
    expect(result.total_views).toBe(5);
    expect(result.views_by_day).toEqual([
      { date: '2026-03-25', count: 2 },
      { date: '2026-03-26', count: 3 },
    ]);
    expect(result.views_by_source).toEqual([{ source: 'direct', count: 5 }]);
    // Pro: 3 queries (total + by_source + by_day)
    expect(mockSql).toHaveBeenCalledTimes(3);
  });

  it('returns zero views when no data', async () => {
    mockSql.mockResolvedValueOnce([{ total_views: 0 }]);
    mockSql.mockResolvedValueOnce([]);

    const result = await getProfileViewsAnalytics(1, '2026-01-01', '2026-02-01', false);
    expect(result.total_views).toBe(0);
    expect(result.views_by_source).toEqual([]);
    expect(result.views_by_day).toEqual([]);
  });
});

describe('getProfileViewsCount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns total count for a sitter in a date range', async () => {
    mockSql.mockResolvedValueOnce([{ total: 17 }]);

    const result = await getProfileViewsCount(1, '2026-01-01', '2027-01-01');
    expect(result).toBe(17);
  });

  it('returns zero when no views', async () => {
    mockSql.mockResolvedValueOnce([{ total: 0 }]);

    const result = await getProfileViewsCount(1, '2026-01-01', '2027-01-01');
    expect(result).toBe(0);
  });
});
