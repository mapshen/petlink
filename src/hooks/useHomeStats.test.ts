import { describe, it, expect } from 'vitest';

interface OwnerStats {
  upcomingBookings: number;
  inProgressBookings: number;
  petCount: number;
  favoriteSitters: number;
}

interface SitterStats {
  revenueThisMonth: number;
  upcomingBookings: number;
  avgRating: number | null;
  reviewCount: number;
  avgResponseHours: number | null;
}

interface Booking {
  status: string;
  start_time: string;
  owner_id: number;
  sitter_id: number;
}

function computeOwnerStats(
  bookings: Booking[],
  userId: number,
  petCount: number,
  favoriteCount: number,
): OwnerStats {
  const myBookings = bookings.filter((b) => b.owner_id === userId);
  const now = new Date();
  return {
    upcomingBookings: myBookings.filter(
      (b) => (b.status === 'confirmed' || b.status === 'pending') && new Date(b.start_time) > now,
    ).length,
    inProgressBookings: myBookings.filter((b) => b.status === 'in_progress').length,
    petCount,
    favoriteSitters: favoriteCount,
  };
}

function computeSitterStats(
  bookings: Booking[],
  userId: number,
  analytics: { total_revenue: number; avg_rating: number | null; review_count: number; avg_response_hours: number | null } | null,
): SitterStats {
  const myBookings = bookings.filter((b) => b.sitter_id === userId);
  const now = new Date();
  return {
    revenueThisMonth: analytics?.total_revenue ?? 0,
    upcomingBookings: myBookings.filter(
      (b) => (b.status === 'confirmed' || b.status === 'pending') && new Date(b.start_time) > now,
    ).length,
    avgRating: analytics?.avg_rating ?? null,
    reviewCount: analytics?.review_count ?? 0,
    avgResponseHours: analytics?.avg_response_hours ?? null,
  };
}

describe('computeOwnerStats', () => {
  const now = new Date();
  const future = new Date(now.getTime() + 86400000).toISOString();
  const past = new Date(now.getTime() - 86400000).toISOString();

  it('counts upcoming confirmed and pending bookings', () => {
    const bookings: Booking[] = [
      { status: 'confirmed', start_time: future, owner_id: 1, sitter_id: 2 },
      { status: 'pending', start_time: future, owner_id: 1, sitter_id: 2 },
      { status: 'cancelled', start_time: future, owner_id: 1, sitter_id: 2 },
      { status: 'confirmed', start_time: past, owner_id: 1, sitter_id: 2 },
    ];
    const stats = computeOwnerStats(bookings, 1, 3, 5);
    expect(stats.upcomingBookings).toBe(2);
  });

  it('counts in-progress bookings', () => {
    const bookings: Booking[] = [
      { status: 'in_progress', start_time: past, owner_id: 1, sitter_id: 2 },
      { status: 'in_progress', start_time: past, owner_id: 1, sitter_id: 2 },
      { status: 'confirmed', start_time: future, owner_id: 1, sitter_id: 2 },
    ];
    const stats = computeOwnerStats(bookings, 1, 0, 0);
    expect(stats.inProgressBookings).toBe(2);
  });

  it('only counts bookings for this user', () => {
    const bookings: Booking[] = [
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
    const bookings: Booking[] = [
      { status: 'confirmed', start_time: future, owner_id: 1, sitter_id: 2 },
      { status: 'pending', start_time: future, owner_id: 1, sitter_id: 2 },
      { status: 'confirmed', start_time: future, owner_id: 1, sitter_id: 99 },
    ];
    const stats = computeSitterStats(bookings, 2, null);
    expect(stats.upcomingBookings).toBe(2);
  });
});
