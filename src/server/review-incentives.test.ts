import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSqlFn } = vi.hoisted(() => {
  const sqlFn = vi.fn();
  return { mockSqlFn: sqlFn };
});
vi.mock('./db.ts', () => ({ default: mockSqlFn }));

const mockIssueCredit = vi.fn().mockResolvedValue({ id: 1, amount_cents: 200 });
vi.mock('./credits.ts', () => ({
  issueCredit: (...args: unknown[]) => mockIssueCredit(...args),
}));

vi.mock('./logger.ts', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  sanitizeError: (e: unknown) => e,
}));

import { issueReviewCredit, FIRST_REVIEW_BONUS_CENTS, SUBSEQUENT_REVIEW_CREDIT_CENTS } from './review-incentives.ts';

describe('review incentives', () => {
  beforeEach(() => vi.clearAllMocks());

  it('issues first-review bonus ($5) when user has no prior reviews', async () => {
    // Count prior reviews: 0
    mockSqlFn.mockResolvedValueOnce([{ count: 0 }]);

    const result = await issueReviewCredit(42, 100);
    expect(result).toEqual({ credited: true, amountCents: FIRST_REVIEW_BONUS_CENTS, isFirstReview: true });
    expect(mockIssueCredit).toHaveBeenCalledWith(
      42,
      FIRST_REVIEW_BONUS_CENTS,
      'milestone',
      'booking',
      'First review bonus — thank you for sharing your experience!',
      100,
      undefined
    );
  });

  it('issues subsequent review credit ($2) when user has prior reviews', async () => {
    // Count prior reviews: 3
    mockSqlFn.mockResolvedValueOnce([{ count: 3 }]);

    const result = await issueReviewCredit(42, 200);
    expect(result).toEqual({ credited: true, amountCents: SUBSEQUENT_REVIEW_CREDIT_CENTS, isFirstReview: false });
    expect(mockIssueCredit).toHaveBeenCalledWith(
      42,
      SUBSEQUENT_REVIEW_CREDIT_CENTS,
      'milestone',
      'booking',
      'Review credit — thanks for helping the PetLink community!',
      200,
      undefined
    );
  });

  it('returns credited=false when issueCredit throws', async () => {
    mockSqlFn.mockResolvedValueOnce([{ count: 0 }]);
    mockIssueCredit.mockRejectedValueOnce(new Error('db error'));

    const result = await issueReviewCredit(42, 100);
    expect(result).toEqual({ credited: false, amountCents: 0, isFirstReview: true });
  });

  it('exports correct dollar amounts', () => {
    expect(FIRST_REVIEW_BONUS_CENTS).toBe(500); // $5
    expect(SUBSEQUENT_REVIEW_CREDIT_CENTS).toBe(200); // $2
  });

  it('count=1 means first review (just-inserted), count=2 means subsequent', async () => {
    // count <= 1 → first review (the just-inserted review is the only one)
    mockSqlFn.mockResolvedValueOnce([{ count: 1 }]);
    const result1 = await issueReviewCredit(42, 300);
    expect(result1.isFirstReview).toBe(true);

    vi.clearAllMocks();
    // count=2 → this is the second review
    mockSqlFn.mockResolvedValueOnce([{ count: 2 }]);
    const result2 = await issueReviewCredit(42, 301);
    expect(result2.isFirstReview).toBe(false);
  });
});
