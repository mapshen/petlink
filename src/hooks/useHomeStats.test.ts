import { describe, it, expect } from 'vitest';
import { computeOwnerStats, computeSitterStats, formatHours } from './homeStatsUtils';

describe('computeOwnerStats', () => {
  const now = new Date();
  const future = new Date(now.getTime() + 86400000).toISOString();
  const past = new Date(now.getTime() - 86400000).toISOString();

  it('counts upcoming confirmed and pending bookings', () => {
    const bookings = [
      { status: 'confirmed', start_time: future, owner_id: 1, sitter_id: 2 },
      { status: 'pending', start_time: future, owner_id: 1, sitter_id: 2 },
      { status: 'cancelled', start_time: future, owner_id: 1, sitter_id: 2 },
      { status: 'confirmed', start_time: past, owner_id: 1, sitter_id: 2 },
    ];
    const stats = computeOwnerStats(bookings, 1, 3, 5);
    expect(stats.upcomingBookings).toBe(2);
  });

  it('counts in-progress bookings', () => {
    const bookings = [
      { status: 'in_progress', start_time: past, owner_id: 1, sitter_id: 2 },
      { status: 'in_progress', start_time: past, owner_id: 1, sitter_id: 2 },
      { status: 'confirmed', start_time: future, owner_id: 1, sitter_id: 2 },
    ];
    const stats = computeOwnerStats(bookings, 1, 0, 0);
    expect(stats.inProgressBookings).toBe(2);
  });

  it('only counts bookings for this user', () => {
    const bookings = [
      { status: 'confirmed', start_time: future, owner_id: 1, sitter_id: 2 },
      { status: 'confirmed', start_time: future, owner_id: 99, sitter_id: 2 },
    ];
    const stats = computeOwnerStats(bookings, 1, 1, 1);
    expect(stats.upcomingBookings).toBe(1);
  });

  it('passes through pet and favorite counts', () => {
    const stats = computeOwnerStats([], 1, 3, 7);
    expect(stats.petCount).toBe(3);
    expect(stats.favoriteSitters).toBe(7);
  });

  it('handles empty bookings', () => {
    const stats = computeOwnerStats([], 1, 0, 0);
    expect(stats.upcomingBookings).toBe(0);
    expect(stats.inProgressBookings).toBe(0);
  });
});

describe('computeSitterStats', () => {
  const now = new Date();
  const future = new Date(now.getTime() + 86400000).toISOString();

  it('extracts analytics values', () => {
    const analytics = { total_revenue: 485, avg_rating: 4.9, review_count: 24, avg_response_hours: 2.1 };
    const stats = computeSitterStats([], 2, analytics);
    expect(stats.revenueThisMonth).toBe(485);
    expect(stats.avgRating).toBe(4.9);
    expect(stats.reviewCount).toBe(24);
    expect(stats.avgResponseHours).toBe(2.1);
  });

  it('handles null analytics', () => {
    const stats = computeSitterStats([], 2, null);
    expect(stats.revenueThisMonth).toBe(0);
    expect(stats.avgRating).toBeNull();
    expect(stats.avgResponseHours).toBeNull();
  });

  it('counts upcoming sitter bookings', () => {
    const bookings = [
      { status: 'confirmed', start_time: future, owner_id: 1, sitter_id: 2 },
      { status: 'pending', start_time: future, owner_id: 1, sitter_id: 2 },
      { status: 'confirmed', start_time: future, owner_id: 1, sitter_id: 99 },
    ];
    const stats = computeSitterStats(bookings, 2, null);
    expect(stats.upcomingBookings).toBe(2);
  });
});

describe('formatHours', () => {
  it('returns -- for null', () => {
    expect(formatHours(null)).toBe('--');
  });

  it('formats sub-hour as minutes', () => {
    expect(formatHours(0.5)).toBe('30m');
    expect(formatHours(0.25)).toBe('15m');
  });

  it('formats hours as rounded whole numbers', () => {
    expect(formatHours(2)).toBe('2h');
    expect(formatHours(2.7)).toBe('3h');
    expect(formatHours(1)).toBe('1h');
  });
});
