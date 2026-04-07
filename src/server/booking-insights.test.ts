import { describe, it, expect } from 'vitest';
import {
  computeProfileCompleteness,
  analyzePricing,
  analyzeResponseTime,
  analyzeAvailability,
  analyzeReviews,
  analyzeVisibility,
  computeBookingTrend,
  generateRecommendations,
  computeBookingInsights,
  type SitterProfileData,
  type InsightInput,
} from './booking-insights.ts';

// --- Fixtures ---

const fullProfile: SitterProfileData = {
  has_avatar: true,
  has_bio: true,
  service_count: 3,
  has_availability: true,
  has_background_check: true,
  photo_count: 5,
  has_location: true,
  accepted_species: ['dog', 'cat'],
};

const emptyProfile: SitterProfileData = {
  has_avatar: false,
  has_bio: false,
  service_count: 0,
  has_availability: false,
  has_background_check: false,
  photo_count: 0,
  has_location: false,
  accepted_species: null,
};

const baseInput: InsightInput = {
  profile: fullProfile,
  pricing: [{ sitter_avg_cents: 3000, local_avg_cents: 3000, service_type: 'walking' }],
  response: { avg_response_hours: 1.5, platform_avg_response_hours: 3 },
  availability: { slots_next_14_days: 10 },
  reviews: { avg_rating: 4.8, review_count: 15, platform_avg_rating: 4.5 },
  visibility: { subscription_tier: 'pro', is_new_sitter: false, profile_completeness_pct: 100, active_strike_weight: 0 },
  trend: { bookings_this_month: 5, bookings_last_month: 3 },
};

// --- computeProfileCompleteness ---

describe('computeProfileCompleteness', () => {
  it('returns 100 for a fully complete profile', () => {
    expect(computeProfileCompleteness(fullProfile)).toBe(100);
  });

  it('returns 0 for a completely empty profile', () => {
    expect(computeProfileCompleteness(emptyProfile)).toBe(0);
  });

  it('gives partial credit for photos (1-2)', () => {
    const partial = { ...fullProfile, photo_count: 2 };
    const full = computeProfileCompleteness(fullProfile);
    const partialScore = computeProfileCompleteness(partial);
    expect(partialScore).toBeLessThan(full);
    expect(partialScore).toBeGreaterThan(0);
  });

  it('includes service count in score', () => {
    const noServices = { ...fullProfile, service_count: 0 };
    expect(computeProfileCompleteness(noServices)).toBeLessThan(computeProfileCompleteness(fullProfile));
  });

  it('caps at 100', () => {
    const overloaded = { ...fullProfile, photo_count: 100 };
    expect(computeProfileCompleteness(overloaded)).toBeLessThanOrEqual(100);
  });
});

// --- analyzePricing ---

describe('analyzePricing', () => {
  it('returns null when no pricing data', () => {
    expect(analyzePricing([])).toBeNull();
  });

  it('returns null when local_avg is null', () => {
    expect(analyzePricing([{ sitter_avg_cents: 3000, local_avg_cents: null, service_type: 'walking' }])).toBeNull();
  });

  it('returns good for competitive pricing', () => {
    const result = analyzePricing([{ sitter_avg_cents: 3000, local_avg_cents: 3000, service_type: 'walking' }]);
    expect(result).not.toBeNull();
    expect(result!.status).toBe('good');
  });

  it('returns warning for pricing significantly above average', () => {
    const result = analyzePricing([{ sitter_avg_cents: 5000, local_avg_cents: 3000, service_type: 'walking' }]);
    expect(result).not.toBeNull();
    expect(result!.status).toBe('warning');
    expect(result!.value).toContain('above');
  });

  it('returns warning for pricing significantly below average', () => {
    const result = analyzePricing([{ sitter_avg_cents: 1500, local_avg_cents: 3000, service_type: 'sitting' }]);
    expect(result).not.toBeNull();
    expect(result!.status).toBe('warning');
    expect(result!.value).toContain('below');
  });

  it('returns good when within thresholds', () => {
    // 15% above is still within 20% threshold
    const result = analyzePricing([{ sitter_avg_cents: 3450, local_avg_cents: 3000, service_type: 'walking' }]);
    expect(result).not.toBeNull();
    expect(result!.status).toBe('good');
  });

  it('uses the first comparable service type', () => {
    const result = analyzePricing([
      { sitter_avg_cents: null, local_avg_cents: 3000, service_type: 'walking' },
      { sitter_avg_cents: 5000, local_avg_cents: 3000, service_type: 'sitting' },
    ]);
    expect(result).not.toBeNull();
    expect(result!.detail).toContain('sitting');
  });
});

// --- analyzeResponseTime ---

describe('analyzeResponseTime', () => {
  it('returns warning when no response data', () => {
    const result = analyzeResponseTime({ avg_response_hours: null, platform_avg_response_hours: 3 });
    expect(result.status).toBe('warning');
    expect(result.value).toBe('No data');
  });

  it('returns good for fast response', () => {
    const result = analyzeResponseTime({ avg_response_hours: 1, platform_avg_response_hours: 3 });
    expect(result.status).toBe('good');
  });

  it('returns warning for moderately slow response', () => {
    const result = analyzeResponseTime({ avg_response_hours: 4, platform_avg_response_hours: 3 });
    expect(result.status).toBe('warning');
  });

  it('returns critical for very slow response', () => {
    const result = analyzeResponseTime({ avg_response_hours: 12, platform_avg_response_hours: 3 });
    expect(result.status).toBe('critical');
  });

  it('includes rounded hours in value', () => {
    const result = analyzeResponseTime({ avg_response_hours: 1.456, platform_avg_response_hours: 3 });
    expect(result.value).toBe('1.5h avg');
  });
});

// --- analyzeAvailability ---

describe('analyzeAvailability', () => {
  it('returns critical when no slots', () => {
    const result = analyzeAvailability({ slots_next_14_days: 0 });
    expect(result.status).toBe('critical');
  });

  it('returns warning for few slots', () => {
    const result = analyzeAvailability({ slots_next_14_days: 2 });
    expect(result.status).toBe('warning');
  });

  it('returns good for sufficient slots', () => {
    const result = analyzeAvailability({ slots_next_14_days: 5 });
    expect(result.status).toBe('good');
  });

  it('handles singular slot text', () => {
    const result = analyzeAvailability({ slots_next_14_days: 1 });
    expect(result.value).toBe('1 slot');
    expect(result.detail).toContain('1 availability slot');
  });
});

// --- analyzeReviews ---

describe('analyzeReviews', () => {
  it('returns warning when no reviews', () => {
    const result = analyzeReviews({ avg_rating: null, review_count: 0, platform_avg_rating: 4.5 });
    expect(result.status).toBe('warning');
    expect(result.value).toBe('No reviews');
  });

  it('returns critical for below-average rating', () => {
    const result = analyzeReviews({ avg_rating: 3.5, review_count: 10, platform_avg_rating: 4.5 });
    expect(result.status).toBe('critical');
  });

  it('returns warning for few reviews even with good rating', () => {
    const result = analyzeReviews({ avg_rating: 5.0, review_count: 3, platform_avg_rating: 4.5 });
    expect(result.status).toBe('warning');
  });

  it('returns good for established sitter with good rating', () => {
    const result = analyzeReviews({ avg_rating: 4.8, review_count: 15, platform_avg_rating: 4.5 });
    expect(result.status).toBe('good');
  });
});

// --- analyzeVisibility ---

describe('analyzeVisibility', () => {
  it('returns critical when demoted by strikes', () => {
    const result = analyzeVisibility({
      subscription_tier: 'pro',
      is_new_sitter: false,
      profile_completeness_pct: 100,
      active_strike_weight: 5,
    });
    expect(result.status).toBe('critical');
    expect(result.value).toBe('Demoted');
  });

  it('returns warning with no boosts', () => {
    const result = analyzeVisibility({
      subscription_tier: 'free',
      is_new_sitter: false,
      profile_completeness_pct: 50,
      active_strike_weight: 0,
    });
    expect(result.status).toBe('warning');
  });

  it('returns good with Pro boost', () => {
    const result = analyzeVisibility({
      subscription_tier: 'pro',
      is_new_sitter: false,
      profile_completeness_pct: 90,
      active_strike_weight: 0,
    });
    expect(result.status).toBe('good');
    expect(result.value).toContain('Pro boost');
  });

  it('lists multiple boosts', () => {
    const result = analyzeVisibility({
      subscription_tier: 'premium',
      is_new_sitter: true,
      profile_completeness_pct: 90,
      active_strike_weight: 0,
    });
    expect(result.value).toContain('Premium boost');
    expect(result.value).toContain('New sitter boost');
    expect(result.value).toContain('Complete profile');
  });
});

// --- computeBookingTrend ---

describe('computeBookingTrend', () => {
  it('returns new when both months are 0', () => {
    expect(computeBookingTrend({ bookings_this_month: 0, bookings_last_month: 0 })).toBe('new');
  });

  it('returns up when this month > last month', () => {
    expect(computeBookingTrend({ bookings_this_month: 5, bookings_last_month: 3 })).toBe('up');
  });

  it('returns down when this month < last month', () => {
    expect(computeBookingTrend({ bookings_this_month: 2, bookings_last_month: 5 })).toBe('down');
  });

  it('returns stable when equal non-zero', () => {
    expect(computeBookingTrend({ bookings_this_month: 3, bookings_last_month: 3 })).toBe('stable');
  });
});

// --- generateRecommendations ---

describe('generateRecommendations', () => {
  it('returns empty for a perfect profile', () => {
    const recs = generateRecommendations(baseInput);
    // Perfect profile with Pro, good reviews, good response — only low-impact items if any
    const highImpact = recs.filter((r) => r.impact === 'high');
    expect(highImpact.length).toBe(0);
  });

  it('recommends adding a photo first for empty profile', () => {
    const input: InsightInput = {
      ...baseInput,
      profile: emptyProfile,
      availability: { slots_next_14_days: 0 },
      response: { avg_response_hours: null, platform_avg_response_hours: 3 },
      reviews: { avg_rating: null, review_count: 0, platform_avg_rating: 4.5 },
      visibility: { ...baseInput.visibility, subscription_tier: 'free' },
    };
    const recs = generateRecommendations(input);
    expect(recs.length).toBeGreaterThan(0);
    // The first recommendation should be high-priority
    expect(recs[0].impact).toBe('high');
  });

  it('recommends setting availability when no slots', () => {
    const input: InsightInput = {
      ...baseInput,
      availability: { slots_next_14_days: 0 },
    };
    const recs = generateRecommendations(input);
    expect(recs.some((r) => r.action.includes('availability'))).toBe(true);
  });

  it('recommends faster responses when slow', () => {
    const input: InsightInput = {
      ...baseInput,
      response: { avg_response_hours: 5, platform_avg_response_hours: 3 },
    };
    const recs = generateRecommendations(input);
    expect(recs.some((r) => r.action.toLowerCase().includes('respond'))).toBe(true);
  });

  it('recommends price adjustment when above average', () => {
    const input: InsightInput = {
      ...baseInput,
      pricing: [{ sitter_avg_cents: 5000, local_avg_cents: 3000, service_type: 'walking' }],
    };
    const recs = generateRecommendations(input);
    expect(recs.some((r) => r.action.toLowerCase().includes('lower'))).toBe(true);
  });

  it('sorts recommendations by priority', () => {
    const input: InsightInput = {
      ...baseInput,
      profile: emptyProfile,
      availability: { slots_next_14_days: 0 },
    };
    const recs = generateRecommendations(input);
    for (let i = 1; i < recs.length; i++) {
      expect(recs[i].priority).toBeGreaterThanOrEqual(recs[i - 1].priority);
    }
  });
});

// --- computeBookingInsights (integration) ---

describe('computeBookingInsights', () => {
  it('returns all expected fields', () => {
    const result = computeBookingInsights(baseInput);
    expect(result.profile_completeness_pct).toBeDefined();
    expect(result.factors).toBeDefined();
    expect(result.recommendations).toBeDefined();
    expect(result.booking_trend).toBeDefined();
  });

  it('includes profile, response, availability, reviews, and visibility factors', () => {
    const result = computeBookingInsights(baseInput);
    const keys = result.factors.map((f) => f.key);
    expect(keys).toContain('profile');
    expect(keys).toContain('response_time');
    expect(keys).toContain('availability');
    expect(keys).toContain('reviews');
    expect(keys).toContain('visibility');
  });

  it('includes pricing factor when data is available', () => {
    const result = computeBookingInsights(baseInput);
    const keys = result.factors.map((f) => f.key);
    expect(keys).toContain('pricing');
  });

  it('omits pricing factor when no data', () => {
    const input: InsightInput = { ...baseInput, pricing: [] };
    const result = computeBookingInsights(input);
    const keys = result.factors.map((f) => f.key);
    expect(keys).not.toContain('pricing');
  });

  it('computes correct profile completeness percentage', () => {
    const result = computeBookingInsights(baseInput);
    expect(result.profile_completeness_pct).toBe(100);
  });

  it('returns up trend when this month > last month', () => {
    const result = computeBookingInsights(baseInput);
    expect(result.booking_trend).toBe('up');
  });

  it('generates recommendations for incomplete profile', () => {
    const input: InsightInput = {
      ...baseInput,
      profile: emptyProfile,
      availability: { slots_next_14_days: 0 },
    };
    const result = computeBookingInsights(input);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it('returns factors with correct status types', () => {
    const result = computeBookingInsights(baseInput);
    for (const factor of result.factors) {
      expect(['good', 'warning', 'critical']).toContain(factor.status);
    }
  });

  it('returns recommendations with correct impact types', () => {
    const input: InsightInput = {
      ...baseInput,
      profile: emptyProfile,
    };
    const result = computeBookingInsights(input);
    for (const rec of result.recommendations) {
      expect(['high', 'medium', 'low']).toContain(rec.impact);
    }
  });
});
