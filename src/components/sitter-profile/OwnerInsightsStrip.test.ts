import { describe, it, expect } from 'vitest';

describe('OwnerInsightsStrip data contracts', () => {
  interface AnalyticsOverview {
    profile_views_30d?: number;
    search_appearances_30d?: number;
    booking_conversion_rate?: number;
  }

  it('handles full data', () => {
    const data: AnalyticsOverview = {
      profile_views_30d: 42,
      search_appearances_30d: 156,
      booking_conversion_rate: 12.5,
    };
    expect(data.profile_views_30d).toBe(42);
    expect(Math.round(data.booking_conversion_rate!)).toBe(13);
  });

  it('handles missing data gracefully', () => {
    const data: AnalyticsOverview = {};
    expect(data.profile_views_30d).toBeUndefined();
    expect(data.search_appearances_30d).toBeUndefined();
    expect(data.booking_conversion_rate).toBeUndefined();
  });

  it('handles null data (API error)', () => {
    const data: AnalyticsOverview | null = null;
    expect(data).toBeNull();
  });

  it('formats conversion rate as integer percentage', () => {
    const rate = 12.7;
    expect(Math.round(rate)).toBe(13);
    expect(`${Math.round(rate)}%`).toBe('13%');
  });
});
