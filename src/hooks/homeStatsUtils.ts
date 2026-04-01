export interface OwnerStats {
  upcomingBookings: number;
  inProgressBookings: number;
  petCount: number;
  favoriteSitters: number;
}

export interface SitterStats {
  revenueThisMonth: number;
  upcomingBookings: number;
  avgRating: number | null;
  reviewCount: number;
  avgResponseHours: number | null;
}

interface BookingLike {
  status: string;
  start_time: string;
  owner_id: number;
  sitter_id: number;
}

export interface AnalyticsOverview {
  total_revenue_cents: number;
  avg_rating: number | null;
  review_count: number;
  avg_response_hours: number | null;
}

export function computeOwnerStats(
  bookings: BookingLike[],
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

export function computeSitterStats(
  bookings: BookingLike[],
  userId: number,
  analytics: AnalyticsOverview | null,
): SitterStats {
  const myBookings = bookings.filter((b) => b.sitter_id === userId);
  const now = new Date();
  return {
    revenueThisMonth: (analytics?.total_revenue_cents ?? 0) / 100,
    upcomingBookings: myBookings.filter(
      (b) => (b.status === 'confirmed' || b.status === 'pending') && new Date(b.start_time) > now,
    ).length,
    avgRating: analytics?.avg_rating ?? null,
    reviewCount: analytics?.review_count ?? 0,
    avgResponseHours: analytics?.avg_response_hours ?? null,
  };
}

export function formatHours(hours: number | null): string {
  if (hours === null) return '--';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  return `${Math.round(hours)}h`;
}
