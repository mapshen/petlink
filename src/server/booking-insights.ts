/**
 * Booking Insights — pure computation functions that analyze a sitter's profile
 * and activity to produce actionable recommendations for improving bookings.
 *
 * No side effects — all data is passed in, insights are returned.
 */

// --- Types ---

export interface SitterProfileData {
  readonly has_avatar: boolean;
  readonly has_bio: boolean;
  readonly service_count: number;
  readonly has_availability: boolean;
  readonly has_background_check: boolean;
  readonly photo_count: number;
  readonly has_location: boolean;
  readonly accepted_species: string[] | null;
}

export interface PricingData {
  readonly sitter_avg_cents: number | null;
  readonly local_avg_cents: number | null;
  readonly service_type: string;
}

export interface ResponseData {
  readonly avg_response_hours: number | null;
  readonly platform_avg_response_hours: number;
}

export interface AvailabilityData {
  readonly slots_next_14_days: number;
}

export interface ReviewData {
  readonly avg_rating: number | null;
  readonly review_count: number;
  readonly platform_avg_rating: number;
}

export interface VisibilityData {
  readonly subscription_tier: string;
  readonly is_new_sitter: boolean;
  readonly profile_completeness_pct: number;
  readonly active_strike_weight: number;
}

export interface BookingTrendData {
  readonly bookings_this_month: number;
  readonly bookings_last_month: number;
}

export interface InsightFactor {
  readonly key: string;
  readonly label: string;
  readonly status: 'good' | 'warning' | 'critical';
  readonly value: string;
  readonly detail: string;
}

export interface Recommendation {
  readonly priority: number;
  readonly action: string;
  readonly impact: 'high' | 'medium' | 'low';
}

export interface BookingInsights {
  readonly profile_completeness_pct: number;
  readonly factors: readonly InsightFactor[];
  readonly recommendations: readonly Recommendation[];
  readonly booking_trend: 'up' | 'down' | 'stable' | 'new';
}

export interface InsightInput {
  readonly profile: SitterProfileData;
  readonly pricing: readonly PricingData[];
  readonly response: ResponseData;
  readonly availability: AvailabilityData;
  readonly reviews: ReviewData;
  readonly visibility: VisibilityData;
  readonly trend: BookingTrendData;
}

// --- Profile Completeness ---

const PROFILE_WEIGHTS: ReadonlyArray<{ key: keyof SitterProfileData; weight: number; label: string }> = [
  { key: 'has_avatar', weight: 20, label: 'Profile photo' },
  { key: 'has_bio', weight: 15, label: 'Bio' },
  { key: 'has_background_check', weight: 20, label: 'Background check' },
  { key: 'has_availability', weight: 15, label: 'Availability' },
  { key: 'has_location', weight: 10, label: 'Location' },
];

export function computeProfileCompleteness(profile: SitterProfileData): number {
  let score = 0;
  for (const { key, weight } of PROFILE_WEIGHTS) {
    if (profile[key]) score += weight;
  }
  if (profile.service_count > 0) score += 10;
  if (profile.photo_count >= 3) score += 10;
  else if (profile.photo_count > 0) score += 5;
  return Math.min(score, 100);
}

// --- Pricing Analysis ---

const PRICING_HIGH_THRESHOLD = 1.20; // 20% above local avg
const PRICING_LOW_THRESHOLD = 0.70;  // 30% below local avg

export function analyzePricing(pricing: readonly PricingData[]): InsightFactor | null {
  const comparable = pricing.filter(
    (p) => p.sitter_avg_cents !== null && p.local_avg_cents !== null && p.local_avg_cents > 0,
  );
  if (comparable.length === 0) return null;

  // Use the first service type with data (usually the primary service)
  const primary = comparable[0];
  const ratio = primary.sitter_avg_cents! / primary.local_avg_cents!;
  const diffCents = primary.sitter_avg_cents! - primary.local_avg_cents!;
  const diffDollars = Math.abs(Math.round(diffCents / 100));

  if (ratio > PRICING_HIGH_THRESHOLD) {
    return {
      key: 'pricing',
      label: 'Pricing',
      status: 'warning',
      value: `$${diffDollars} above average`,
      detail: `Your ${primary.service_type} rate is ${Math.round((ratio - 1) * 100)}% above the local average. Consider lowering by $${diffDollars} to be more competitive.`,
    };
  }
  if (ratio < PRICING_LOW_THRESHOLD) {
    return {
      key: 'pricing',
      label: 'Pricing',
      status: 'warning',
      value: `$${diffDollars} below average`,
      detail: `Your ${primary.service_type} rate is ${Math.round((1 - ratio) * 100)}% below the local average. You may be undervaluing your services.`,
    };
  }
  return {
    key: 'pricing',
    label: 'Pricing',
    status: 'good',
    value: 'Competitive',
    detail: `Your rates are within the local average range for ${primary.service_type}.`,
  };
}

// --- Response Time ---

const SLOW_RESPONSE_HOURS = 2;
const VERY_SLOW_RESPONSE_HOURS = 8;

export function analyzeResponseTime(response: ResponseData): InsightFactor {
  const { avg_response_hours, platform_avg_response_hours } = response;
  if (avg_response_hours === null) {
    return {
      key: 'response_time',
      label: 'Response Time',
      status: 'warning',
      value: 'No data',
      detail: 'You haven\'t responded to any inquiries yet. Fast responses help you rank higher in search.',
    };
  }
  const rounded = Math.round(avg_response_hours * 10) / 10;
  if (avg_response_hours > VERY_SLOW_RESPONSE_HOURS) {
    return {
      key: 'response_time',
      label: 'Response Time',
      status: 'critical',
      value: `${rounded}h avg`,
      detail: `Your average response time is ${rounded} hours, well above the platform average of ${platform_avg_response_hours}h. Aim to respond within 2 hours.`,
    };
  }
  if (avg_response_hours > SLOW_RESPONSE_HOURS) {
    return {
      key: 'response_time',
      label: 'Response Time',
      status: 'warning',
      value: `${rounded}h avg`,
      detail: `Your average response time is ${rounded} hours. The platform average is ${platform_avg_response_hours}h. Try to respond within 2 hours.`,
    };
  }
  return {
    key: 'response_time',
    label: 'Response Time',
    status: 'good',
    value: `${rounded}h avg`,
    detail: `Great! Your response time of ${rounded}h is fast. This helps you rank higher in search results.`,
  };
}

// --- Availability Gaps ---

export function analyzeAvailability(availability: AvailabilityData): InsightFactor {
  const { slots_next_14_days } = availability;
  if (slots_next_14_days === 0) {
    return {
      key: 'availability',
      label: 'Availability',
      status: 'critical',
      value: 'No slots',
      detail: 'You have no availability set for the next 2 weeks. Owners can\'t book you without open slots.',
    };
  }
  if (slots_next_14_days < 3) {
    return {
      key: 'availability',
      label: 'Availability',
      status: 'warning',
      value: `${slots_next_14_days} slot${slots_next_14_days !== 1 ? 's' : ''}`,
      detail: `You only have ${slots_next_14_days} availability slot${slots_next_14_days !== 1 ? 's' : ''} in the next 2 weeks. Adding more will help you get discovered.`,
    };
  }
  return {
    key: 'availability',
    label: 'Availability',
    status: 'good',
    value: `${slots_next_14_days} slots`,
    detail: `You have ${slots_next_14_days} availability slots in the next 2 weeks. Good coverage!`,
  };
}

// --- Review Quality ---

export function analyzeReviews(reviews: ReviewData): InsightFactor {
  const { avg_rating, review_count, platform_avg_rating } = reviews;
  if (review_count === 0) {
    return {
      key: 'reviews',
      label: 'Reviews',
      status: 'warning',
      value: 'No reviews',
      detail: 'You don\'t have any reviews yet. Complete bookings and encourage owners to leave reviews.',
    };
  }
  const ratingStr = avg_rating !== null ? avg_rating.toFixed(1) : 'N/A';
  if (avg_rating !== null && avg_rating < platform_avg_rating - 0.5) {
    return {
      key: 'reviews',
      label: 'Reviews',
      status: 'critical',
      value: `${ratingStr} (${review_count} reviews)`,
      detail: `Your rating of ${ratingStr} is below the platform average of ${platform_avg_rating.toFixed(1)}. Focus on providing excellent care to improve.`,
    };
  }
  if (review_count < 5) {
    return {
      key: 'reviews',
      label: 'Reviews',
      status: 'warning',
      value: `${ratingStr} (${review_count} reviews)`,
      detail: `You have ${review_count} review${review_count !== 1 ? 's' : ''}. Getting to 5+ reviews will significantly boost your visibility.`,
    };
  }
  return {
    key: 'reviews',
    label: 'Reviews',
    status: 'good',
    value: `${ratingStr} (${review_count} reviews)`,
    detail: `Your rating of ${ratingStr} with ${review_count} reviews is solid. Keep up the great work!`,
  };
}

// --- Search Visibility ---

export function analyzeVisibility(visibility: VisibilityData): InsightFactor {
  const { subscription_tier, is_new_sitter, profile_completeness_pct, active_strike_weight } = visibility;

  if (active_strike_weight >= 5) {
    return {
      key: 'visibility',
      label: 'Search Visibility',
      status: 'critical',
      value: 'Demoted',
      detail: 'Your reliability score has caused a search ranking demotion. Complete bookings reliably to recover.',
    };
  }

  const boosts: string[] = [];
  if (subscription_tier === 'pro') boosts.push('Pro boost');
  if (subscription_tier === 'premium') boosts.push('Premium boost');
  if (is_new_sitter) boosts.push('New sitter boost');
  if (profile_completeness_pct >= 80) boosts.push('Complete profile');

  if (boosts.length === 0) {
    return {
      key: 'visibility',
      label: 'Search Visibility',
      status: 'warning',
      value: 'Basic',
      detail: 'You have no active search boosts. Complete your profile or upgrade your subscription to rank higher.',
    };
  }
  return {
    key: 'visibility',
    label: 'Search Visibility',
    status: 'good',
    value: boosts.join(', '),
    detail: `Active boosts: ${boosts.join(', ')}. These help you appear higher in search results.`,
  };
}

// --- Booking Trend ---

export function computeBookingTrend(trend: BookingTrendData): 'up' | 'down' | 'stable' | 'new' {
  const { bookings_this_month, bookings_last_month } = trend;
  if (bookings_this_month === 0 && bookings_last_month === 0) return 'new';
  if (bookings_this_month > bookings_last_month) return 'up';
  if (bookings_this_month < bookings_last_month) return 'down';
  return 'stable';
}

// --- Recommendations ---

export function generateRecommendations(input: InsightInput): readonly Recommendation[] {
  const recs: Recommendation[] = [];

  // Profile gaps
  if (!input.profile.has_avatar) {
    recs.push({ priority: 1, action: 'Add a profile photo — profiles with photos get 5x more bookings.', impact: 'high' });
  }
  if (!input.profile.has_bio) {
    recs.push({ priority: 2, action: 'Write a bio to tell owners about yourself and your experience.', impact: 'high' });
  }
  if (!input.profile.has_background_check) {
    recs.push({ priority: 3, action: 'Complete a background check to earn the verified badge.', impact: 'high' });
  }
  if (input.profile.service_count === 0) {
    recs.push({ priority: 1, action: 'Add at least one service (walking, sitting, etc.) so owners can book you.', impact: 'high' });
  }
  if (input.profile.photo_count < 3) {
    recs.push({ priority: 5, action: 'Add more portfolio photos — sitters with 3+ photos get more inquiries.', impact: 'medium' });
  }

  // Availability
  if (input.availability.slots_next_14_days === 0) {
    recs.push({ priority: 1, action: 'Set your availability for the next 2 weeks so owners can book you.', impact: 'high' });
  } else if (input.availability.slots_next_14_days < 3) {
    recs.push({ priority: 4, action: 'Add more availability slots for the next 2 weeks to attract more bookings.', impact: 'medium' });
  }

  // Response time
  if (input.response.avg_response_hours !== null && input.response.avg_response_hours > SLOW_RESPONSE_HOURS) {
    recs.push({ priority: 3, action: 'Respond to messages faster — aim for under 2 hours. Turn on push notifications.', impact: 'high' });
  }

  // Pricing
  const pricingFactor = analyzePricing(input.pricing);
  if (pricingFactor && pricingFactor.status === 'warning' && pricingFactor.value.includes('above')) {
    const comparable = input.pricing.find(
      (p) => p.sitter_avg_cents !== null && p.local_avg_cents !== null && p.local_avg_cents > 0,
    );
    if (comparable) {
      const diffDollars = Math.round(Math.abs(comparable.sitter_avg_cents! - comparable.local_avg_cents!) / 100);
      recs.push({
        priority: 4,
        action: `Lower your ${comparable.service_type} rate by ~$${diffDollars} to match the local average.`,
        impact: 'medium',
      });
    }
  }

  // Reviews
  if (input.reviews.review_count === 0) {
    recs.push({ priority: 5, action: 'Complete your first booking — reviews are key to building trust with new owners.', impact: 'medium' });
  } else if (input.reviews.review_count < 5) {
    recs.push({ priority: 6, action: 'Keep accepting bookings to get to 5+ reviews. This significantly boosts visibility.', impact: 'medium' });
  }

  // Subscription
  if (input.visibility.subscription_tier === 'free') {
    recs.push({ priority: 7, action: 'Upgrade to Pro for priority placement in search results.', impact: 'low' });
  }

  // Sort by priority (lower = higher priority)
  return [...recs].sort((a, b) => a.priority - b.priority);
}

// --- Main Computation ---

export function computeBookingInsights(input: InsightInput): BookingInsights {
  const profilePct = computeProfileCompleteness(input.profile);

  const factors: InsightFactor[] = [];

  // Profile completeness factor
  factors.push({
    key: 'profile',
    label: 'Profile Completeness',
    status: profilePct >= 80 ? 'good' : profilePct >= 50 ? 'warning' : 'critical',
    value: `${profilePct}%`,
    detail: profilePct >= 80
      ? 'Your profile is well-filled out. Great job!'
      : `Your profile is ${profilePct}% complete. Fill in the missing sections to rank higher.`,
  });

  // Pricing
  const pricingFactor = analyzePricing(input.pricing);
  if (pricingFactor) factors.push(pricingFactor);

  // Response time
  factors.push(analyzeResponseTime(input.response));

  // Availability
  factors.push(analyzeAvailability(input.availability));

  // Reviews
  factors.push(analyzeReviews(input.reviews));

  // Visibility
  factors.push(analyzeVisibility({
    ...input.visibility,
    profile_completeness_pct: profilePct,
  }));

  const recommendations = generateRecommendations(input);
  const booking_trend = computeBookingTrend(input.trend);

  return {
    profile_completeness_pct: profilePct,
    factors,
    recommendations,
    booking_trend,
  };
}
