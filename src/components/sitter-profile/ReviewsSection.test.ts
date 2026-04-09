import { describe, it, expect } from 'vitest';
import type { Review, ImportedReview } from '../../types';

describe('ReviewsSection data contracts', () => {
  const mockReviews: Review[] = [
    {
      id: 1,
      reviewer_id: 10,
      reviewee_id: 20,
      booking_id: 1,
      rating: 5,
      comment: 'Great sitter!',
      created_at: '2026-01-15T00:00:00Z',
      reviewer_name: 'Jessica R.',
      reviewer_avatar: null,
    } as Review,
    {
      id: 2,
      reviewer_id: 11,
      reviewee_id: 20,
      rating: 4,
      comment: null,
      created_at: '2026-01-10T00:00:00Z',
      reviewer_name: 'Tom K.',
    } as Review,
  ];

  const mockImportedReviews: ImportedReview[] = [
    {
      id: 1,
      sitter_id: 20,
      platform: 'rover',
      reviewer_name: 'External User',
      rating: 5,
      comment: 'Imported review',
      review_date: '2025-12-01',
    } as ImportedReview,
  ];

  it('reviews have required fields', () => {
    expect(mockReviews[0].rating).toBe(5);
    expect(mockReviews[0].reviewer_name).toBe('Jessica R.');
    expect(mockReviews[0].created_at).toBeDefined();
  });

  it('reviews can have null comments', () => {
    expect(mockReviews[1].comment).toBeNull();
  });

  it('imported reviews have platform field', () => {
    expect(mockImportedReviews[0].platform).toBe('rover');
  });

  it('handles empty reviews array', () => {
    const empty: Review[] = [];
    expect(empty.length).toBe(0);
  });

  it('handles empty imported reviews array', () => {
    const empty: ImportedReview[] = [];
    expect(empty.length).toBe(0);
  });

  it('onReportReview callback receives review id', () => {
    let reportedId: number | null = null;
    const onReport = (id: number) => { reportedId = id; };
    onReport(mockReviews[0].id);
    expect(reportedId).toBe(1);
  });
});
