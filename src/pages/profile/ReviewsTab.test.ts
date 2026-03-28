import { describe, it, expect } from 'vitest';
import type { Review } from '../../types';
import { computeReviewStats } from './ReviewsTab';

describe('computeReviewStats', () => {
  it('returns zeros for empty array', () => {
    expect(computeReviewStats([])).toEqual({ average: 0, count: 0 });
  });

  it('returns correct stats for a single review', () => {
    const reviews: Review[] = [
      { id: 1, booking_id: 1, reviewer_id: 2, reviewee_id: 3, rating: 4, created_at: '2026-01-01' },
    ];
    expect(computeReviewStats(reviews)).toEqual({ average: 4, count: 1 });
  });

  it('returns correct average for multiple reviews', () => {
    const reviews: Review[] = [
      { id: 1, booking_id: 1, reviewer_id: 2, reviewee_id: 3, rating: 5, created_at: '2026-01-01' },
      { id: 2, booking_id: 2, reviewer_id: 4, reviewee_id: 3, rating: 4, created_at: '2026-01-02' },
      { id: 3, booking_id: 3, reviewer_id: 5, reviewee_id: 3, rating: 3, created_at: '2026-01-03' },
    ];
    expect(computeReviewStats(reviews)).toEqual({ average: 4, count: 3 });
  });

  it('rounds average to 1 decimal place', () => {
    const reviews: Review[] = [
      { id: 1, booking_id: 1, reviewer_id: 2, reviewee_id: 3, rating: 5, created_at: '2026-01-01' },
      { id: 2, booking_id: 2, reviewer_id: 4, reviewee_id: 3, rating: 4, created_at: '2026-01-02' },
      { id: 3, booking_id: 3, reviewer_id: 5, reviewee_id: 3, rating: 4, created_at: '2026-01-03' },
    ];
    // (5 + 4 + 4) / 3 = 4.333...
    expect(computeReviewStats(reviews)).toEqual({ average: 4.3, count: 3 });
  });

  it('handles all 5-star reviews', () => {
    const reviews: Review[] = [
      { id: 1, booking_id: 1, reviewer_id: 2, reviewee_id: 3, rating: 5, created_at: '2026-01-01' },
      { id: 2, booking_id: 2, reviewer_id: 4, reviewee_id: 3, rating: 5, created_at: '2026-01-02' },
    ];
    expect(computeReviewStats(reviews)).toEqual({ average: 5, count: 2 });
  });

  it('handles fractional averages correctly', () => {
    const reviews: Review[] = [
      { id: 1, booking_id: 1, reviewer_id: 2, reviewee_id: 3, rating: 3, created_at: '2026-01-01' },
      { id: 2, booking_id: 2, reviewer_id: 4, reviewee_id: 3, rating: 5, created_at: '2026-01-02' },
    ];
    // (3 + 5) / 2 = 4.0
    expect(computeReviewStats(reviews)).toEqual({ average: 4, count: 2 });
  });
});
