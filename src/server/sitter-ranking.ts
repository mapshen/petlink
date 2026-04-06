/**
 * Sitter ranking algorithm.
 *
 * Computes a weighted score for sitter search results based on:
 *   - Review score (30%): avg_rating * log(review_count + 1)
 *   - Completion rate (20%): completed / total bookings
 *   - Response time (15%): faster = better (normalized to 0-1)
 *   - Repeat booking rate (15%): % of owners who rebook
 *   - Profile completeness (10%): has photo, bio, services, availability
 *   - New sitter boost (10%): 45-day boost for newly approved sitters
 *
 * After base score, tier-based additive boost:
 *   - Pro: +0.05 (priority placement)
 *   - Premium: +0.10 (promoted in search)
 *
 * Reliability penalty:
 *   - 5+ active strikes: -0.15 (temporary search demotion)
 */

export interface SitterStats {
  avg_rating: number | null;
  review_count: number;
  completed_bookings: number;
  total_bookings: number;
  avg_response_hours: number | null;
  repeat_owner_count: number;
  unique_owner_count: number;
  has_avatar: boolean;
  has_bio: boolean;
  service_count: number;
  has_availability: boolean;
  approved_at: string | null;
  distance_meters?: number | null;
  subscription_tier?: string;
  active_strike_weight?: number;
}

const WEIGHTS = {
  review: 0.30,
  completion: 0.20,
  response: 0.15,
  repeat: 0.15,
  profile: 0.10,
  newBoost: 0.10,
} as const;

const MAX_RESPONSE_HOURS = 24;
const NEW_SITTER_DAYS = 45;

export function calculateRankingScore(stats: SitterStats): number {
  const reviewScore = computeReviewScore(stats.avg_rating, stats.review_count);
  const completionScore = computeCompletionRate(stats.completed_bookings, stats.total_bookings);
  const responseScore = computeResponseScore(stats.avg_response_hours);
  const repeatScore = computeRepeatRate(stats.repeat_owner_count, stats.unique_owner_count);
  const profileScore = computeProfileCompleteness(stats);
  const newBoost = computeNewSitterBoost(stats.approved_at);

  const baseScore =
    reviewScore * WEIGHTS.review +
    completionScore * WEIGHTS.completion +
    responseScore * WEIGHTS.response +
    repeatScore * WEIGHTS.repeat +
    profileScore * WEIGHTS.profile +
    newBoost * WEIGHTS.newBoost;

  const tierBoost = computeTierBoost(stats.subscription_tier);
  const reliabilityPenalty = computeReliabilityPenalty(stats.active_strike_weight);
  return Math.max(0, Math.min(baseScore + tierBoost - reliabilityPenalty, 1));
}

export function computeTierBoost(subscriptionTier?: string): number {
  if (subscriptionTier === 'premium') return 0.10;
  if (subscriptionTier === 'pro') return 0.05;
  return 0;
}

const DEMOTION_STRIKE_THRESHOLD = 5;
const DEMOTION_PENALTY = 0.15;

export function computeReliabilityPenalty(activeStrikeWeight?: number): number {
  if (!activeStrikeWeight || activeStrikeWeight < DEMOTION_STRIKE_THRESHOLD) return 0;
  return DEMOTION_PENALTY;
}

export function computeReviewScore(avgRating: number | null, reviewCount: number): number {
  if (!avgRating || reviewCount === 0) return 0;
  // Normalize: (rating/5) * log(count+1)/log(max_expected_reviews)
  const normalized = (avgRating / 5) * (Math.log(reviewCount + 1) / Math.log(101));
  return Math.min(normalized, 1);
}

export function computeCompletionRate(completed: number, total: number): number {
  if (total === 0) return 0.5; // Neutral for new sitters
  return completed / total;
}

export function computeResponseScore(avgResponseHours: number | null): number {
  if (avgResponseHours === null) return 0.5; // Neutral for new sitters
  if (avgResponseHours <= 0) return 1;
  // Lower response time = higher score. Cap at MAX_RESPONSE_HOURS
  return Math.max(0, 1 - (avgResponseHours / MAX_RESPONSE_HOURS));
}

export function computeRepeatRate(repeatOwners: number, uniqueOwners: number): number {
  if (uniqueOwners < 2) return 0.5; // Neutral for new sitters
  return repeatOwners / uniqueOwners;
}

export function computeProfileCompleteness(stats: SitterStats): number {
  let score = 0;
  if (stats.has_avatar) score += 0.3;
  if (stats.has_bio) score += 0.3;
  if (stats.service_count > 0) score += 0.2;
  if (stats.has_availability) score += 0.2;
  return score;
}

export function computeNewSitterBoost(approvedAt: string | null): number {
  if (!approvedAt) return 0;
  const approvedDate = new Date(approvedAt);
  const now = new Date();
  const daysSinceApproved = (now.getTime() - approvedDate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSinceApproved <= NEW_SITTER_DAYS) {
    return 1 - (daysSinceApproved / NEW_SITTER_DAYS);
  }
  return 0;
}

export function isNewSitter(approvedAt: string | null): boolean {
  if (!approvedAt) return false;
  const approvedDate = new Date(approvedAt);
  const now = new Date();
  const daysSinceApproved = (now.getTime() - approvedDate.getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceApproved <= NEW_SITTER_DAYS;
}
