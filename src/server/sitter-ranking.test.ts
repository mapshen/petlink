import { describe, it, expect } from 'vitest';
import {
  calculateRankingScore,
  computeReviewScore,
  computeCompletionRate,
  computeResponseScore,
  computeRepeatRate,
  computeProfileCompleteness,
  computeNewSitterBoost,
  computeTierBoost,
  isNewSitter,
  type SitterStats,
} from './sitter-ranking.ts';

const baseSitter: SitterStats = {
  avg_rating: null,
  review_count: 0,
  completed_bookings: 0,
  total_bookings: 0,
  avg_response_hours: null,
  repeat_owner_count: 0,
  unique_owner_count: 0,
  has_avatar: false,
  has_bio: false,
  service_count: 0,
  has_availability: false,
  approved_at: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days ago
};

describe('computeReviewScore', () => {
  it('returns 0 for no reviews', () => {
    expect(computeReviewScore(null, 0)).toBe(0);
  });

  it('scores higher with more reviews and higher rating', () => {
    const low = computeReviewScore(3, 2);
    const high = computeReviewScore(5, 50);
    expect(high).toBeGreaterThan(low);
  });

  it('caps at 1', () => {
    expect(computeReviewScore(5, 200)).toBeLessThanOrEqual(1);
  });
});

describe('computeCompletionRate', () => {
  it('returns 0.5 for new sitters with no bookings', () => {
    expect(computeCompletionRate(0, 0)).toBe(0.5);
  });

  it('returns 1 for 100% completion', () => {
    expect(computeCompletionRate(10, 10)).toBe(1);
  });

  it('returns correct rate', () => {
    expect(computeCompletionRate(8, 10)).toBe(0.8);
  });
});

describe('computeResponseScore', () => {
  it('returns 0.5 for new sitters with no data', () => {
    expect(computeResponseScore(null)).toBe(0.5);
  });

  it('returns 1 for instant response', () => {
    expect(computeResponseScore(0)).toBe(1);
  });

  it('returns 0 for 24+ hour response', () => {
    expect(computeResponseScore(24)).toBe(0);
    expect(computeResponseScore(48)).toBe(0);
  });

  it('scores faster responses higher', () => {
    const fast = computeResponseScore(1);
    const slow = computeResponseScore(12);
    expect(fast).toBeGreaterThan(slow);
  });
});

describe('computeRepeatRate', () => {
  it('returns 0.5 for new sitters', () => {
    expect(computeRepeatRate(0, 0)).toBe(0.5);
    expect(computeRepeatRate(0, 1)).toBe(0.5);
  });

  it('returns correct rate for experienced sitters', () => {
    expect(computeRepeatRate(3, 5)).toBe(0.6);
  });
});

describe('computeProfileCompleteness', () => {
  it('returns 0 for empty profile', () => {
    expect(computeProfileCompleteness(baseSitter)).toBe(0);
  });

  it('returns 1 for complete profile', () => {
    expect(computeProfileCompleteness({
      ...baseSitter,
      has_avatar: true, has_bio: true, service_count: 2, has_availability: true,
    })).toBe(1);
  });

  it('returns partial score', () => {
    expect(computeProfileCompleteness({
      ...baseSitter,
      has_avatar: true, has_bio: true,
    })).toBe(0.6);
  });
});

describe('computeNewSitterBoost', () => {
  it('returns ~1 for freshly approved sitter', () => {
    expect(computeNewSitterBoost(new Date().toISOString())).toBeGreaterThan(0.9);
  });

  it('returns 0 for sitter approved 60 days ago', () => {
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    expect(computeNewSitterBoost(old)).toBe(0);
  });

  it('returns 0 for null approved_at', () => {
    expect(computeNewSitterBoost(null)).toBe(0);
  });

  it('decreases linearly over 45 days', () => {
    const day22 = new Date(Date.now() - 22 * 24 * 60 * 60 * 1000).toISOString();
    const boost = computeNewSitterBoost(day22);
    expect(boost).toBeGreaterThan(0.4);
    expect(boost).toBeLessThan(0.6);
  });

  it('still has boost at day 40', () => {
    const day40 = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    expect(computeNewSitterBoost(day40)).toBeGreaterThan(0);
  });
});

describe('isNewSitter', () => {
  it('returns true for sitter approved today', () => {
    expect(isNewSitter(new Date().toISOString())).toBe(true);
  });

  it('returns false for sitter approved 60 days ago', () => {
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    expect(isNewSitter(old)).toBe(false);
  });

  it('returns false for null approved_at', () => {
    expect(isNewSitter(null)).toBe(false);
  });

  it('returns true at day 44', () => {
    const day44 = new Date(Date.now() - 44 * 24 * 60 * 60 * 1000).toISOString();
    expect(isNewSitter(day44)).toBe(true);
  });
});

describe('calculateRankingScore', () => {
  it('returns a score between 0 and 1', () => {
    const score = calculateRankingScore(baseSitter);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('ranks experienced sitter with good reviews higher than empty profile', () => {
    const experienced: SitterStats = {
      ...baseSitter,
      avg_rating: 4.8,
      review_count: 30,
      completed_bookings: 45,
      total_bookings: 50,
      avg_response_hours: 2,
      repeat_owner_count: 10,
      unique_owner_count: 20,
      has_avatar: true,
      has_bio: true,
      service_count: 3,
      has_availability: true,
    };

    const experiencedScore = calculateRankingScore(experienced);
    const emptyScore = calculateRankingScore(baseSitter);
    expect(experiencedScore).toBeGreaterThan(emptyScore);
    expect(experiencedScore).toBeGreaterThan(0.5);
  });

  it('gives new sitters a boost', () => {
    const newSitter: SitterStats = {
      ...baseSitter,
      approved_at: new Date().toISOString(),
      has_avatar: true,
      has_bio: true,
      service_count: 1,
      has_availability: true,
    };

    const newScore = calculateRankingScore(newSitter);
    const oldScore = calculateRankingScore({ ...newSitter, approved_at: baseSitter.approved_at });
    expect(newScore).toBeGreaterThan(oldScore);
  });

  it('gives Pro sitters a ranking boost over Free', () => {
    const free = calculateRankingScore({ ...baseSitter, subscription_tier: 'free' });
    const pro = calculateRankingScore({ ...baseSitter, subscription_tier: 'pro' });
    expect(pro).toBeGreaterThan(free);
    expect(pro - free).toBeCloseTo(0.05, 2);
  });

  it('gives Premium sitters a larger boost than Pro', () => {
    const pro = calculateRankingScore({ ...baseSitter, subscription_tier: 'pro' });
    const premium = calculateRankingScore({ ...baseSitter, subscription_tier: 'premium' });
    expect(premium).toBeGreaterThan(pro);
    expect(premium - pro).toBeCloseTo(0.05, 2);
  });

  it('caps score at 1.0 even with tier boost', () => {
    const maxSitter: SitterStats = {
      ...baseSitter,
      avg_rating: 5.0,
      review_count: 100,
      completed_bookings: 100,
      total_bookings: 100,
      avg_response_hours: 0.5,
      repeat_owner_count: 50,
      unique_owner_count: 50,
      has_avatar: true,
      has_bio: true,
      service_count: 5,
      has_availability: true,
      approved_at: new Date().toISOString(),
      subscription_tier: 'premium',
    };
    expect(calculateRankingScore(maxSitter)).toBeLessThanOrEqual(1);
  });
});

describe('computeTierBoost', () => {
  it('returns 0 for free tier', () => {
    expect(computeTierBoost('free')).toBe(0);
  });

  it('returns 0.05 for pro tier', () => {
    expect(computeTierBoost('pro')).toBe(0.05);
  });

  it('returns 0.10 for premium tier', () => {
    expect(computeTierBoost('premium')).toBe(0.10);
  });

  it('returns 0 for undefined', () => {
    expect(computeTierBoost(undefined)).toBe(0);
  });
});
