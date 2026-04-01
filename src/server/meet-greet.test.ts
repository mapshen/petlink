import { describe, it, expect } from 'vitest';

/** Meet & greet should appear first in service type ordering */
function sortServicesWithMeetGreetFirst(serviceTypes: string[]): string[] {
  return [...serviceTypes].sort((a, b) => {
    if (a === 'meet_greet') return -1;
    if (b === 'meet_greet') return 1;
    return 0;
  });
}

/** M&G bookings should be excluded from ranking stats */
function filterRankingBookings(bookings: { service_type: string; status: string }[]): typeof bookings {
  return bookings.filter((b) => b.service_type !== 'meet_greet');
}

/** M&G reviews should be excluded from average rating */
function filterRatingReviews(reviews: { service_type?: string; rating: number }[]): typeof reviews {
  return reviews.filter((r) => r.service_type !== 'meet_greet');
}

describe('sortServicesWithMeetGreetFirst', () => {
  it('puts meet_greet first', () => {
    const sorted = sortServicesWithMeetGreetFirst(['walking', 'sitting', 'meet_greet', 'grooming']);
    expect(sorted[0]).toBe('meet_greet');
  });

  it('preserves order of other services', () => {
    const sorted = sortServicesWithMeetGreetFirst(['walking', 'sitting', 'meet_greet']);
    expect(sorted).toEqual(['meet_greet', 'walking', 'sitting']);
  });

  it('handles list without meet_greet', () => {
    const sorted = sortServicesWithMeetGreetFirst(['walking', 'sitting']);
    expect(sorted).toEqual(['walking', 'sitting']);
  });

  it('handles meet_greet already first', () => {
    const sorted = sortServicesWithMeetGreetFirst(['meet_greet', 'walking']);
    expect(sorted).toEqual(['meet_greet', 'walking']);
  });
});

describe('filterRankingBookings', () => {
  it('excludes meet_greet from ranking', () => {
    const bookings = [
      { service_type: 'walking', status: 'completed' },
      { service_type: 'meet_greet', status: 'completed' },
      { service_type: 'sitting', status: 'completed' },
    ];
    const filtered = filterRankingBookings(bookings);
    expect(filtered).toHaveLength(2);
    expect(filtered.every((b) => b.service_type !== 'meet_greet')).toBe(true);
  });
});

describe('filterRatingReviews', () => {
  it('excludes meet_greet reviews from average', () => {
    const reviews = [
      { service_type: 'walking', rating: 5 },
      { service_type: 'meet_greet', rating: 3 },
      { service_type: 'sitting', rating: 4 },
    ];
    const filtered = filterRatingReviews(reviews);
    expect(filtered).toHaveLength(2);
    const avg = filtered.reduce((sum, r) => sum + r.rating, 0) / filtered.length;
    expect(avg).toBe(4.5);
  });
});
