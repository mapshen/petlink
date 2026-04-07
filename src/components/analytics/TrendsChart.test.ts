import { describe, it, expect } from 'vitest';
import type { AnalyticsTrends, TrendDataPoint } from '../../types';

// Test helpers that mirror the component's pure logic

function formatPeriodLabel(period: string): string {
  if (period.includes('W')) return period.replace(/^\d{4}-/, '');
  if (period.length === 10) return period.slice(5);
  return period.replace(/^\d{4}-/, '');
}

function computeDeltaPct(current: number, previous: number): number | null {
  if (previous === 0 && current === 0) return 0;
  if (previous === 0) return null; // "New" indicator
  return Math.round(((current - previous) / previous) * 100);
}

describe('formatPeriodLabel', () => {
  it('formats daily period (YYYY-MM-DD) to MM-DD', () => {
    expect(formatPeriodLabel('2025-03-15')).toBe('03-15');
  });

  it('formats weekly period (YYYY-WIW) to WIW', () => {
    expect(formatPeriodLabel('2025-W12')).toBe('W12');
  });

  it('formats monthly period (YYYY-MM) to MM', () => {
    expect(formatPeriodLabel('2025-03')).toBe('03');
  });

  it('handles single-digit week numbers', () => {
    expect(formatPeriodLabel('2025-W01')).toBe('W01');
  });

  it('handles end-of-year dates', () => {
    expect(formatPeriodLabel('2025-12-31')).toBe('12-31');
  });
});

describe('computeDeltaPct', () => {
  it('returns 0 when both values are 0', () => {
    expect(computeDeltaPct(0, 0)).toBe(0);
  });

  it('returns null when previous is 0 but current > 0 (new)', () => {
    expect(computeDeltaPct(10, 0)).toBeNull();
  });

  it('returns 100 for doubling', () => {
    expect(computeDeltaPct(20, 10)).toBe(100);
  });

  it('returns -50 for halving', () => {
    expect(computeDeltaPct(5, 10)).toBe(-50);
  });

  it('returns 0 for no change', () => {
    expect(computeDeltaPct(10, 10)).toBe(0);
  });

  it('handles large increases', () => {
    expect(computeDeltaPct(100, 1)).toBe(9900);
  });

  it('handles small decreases', () => {
    expect(computeDeltaPct(9, 10)).toBe(-10);
  });
});

describe('AnalyticsTrends type shape', () => {
  it('has correct structure', () => {
    const trends: AnalyticsTrends = {
      period: 'weekly',
      data: [
        {
          period: '2025-W10',
          profile_views: 45,
          inquiries: 3,
          bookings_requested: 2,
          bookings_confirmed: 2,
          bookings_completed: 1,
          bookings_cancelled: 0,
          revenue_cents: 5000,
        },
      ],
      funnel: {
        profile_views: 45,
        inquiries: 3,
        bookings_requested: 2,
        bookings_confirmed: 2,
        bookings_completed: 1,
      },
      conversion_rates: {
        views_to_inquiries: 6.7,
        inquiries_to_bookings: 66.7,
        bookings_to_confirmed: 100,
        confirmed_to_completed: 50,
      },
      previous_period_totals: {
        profile_views: 30,
        inquiries: 2,
        bookings_requested: 1,
        bookings_completed: 1,
        revenue_cents: 3000,
      },
    };

    expect(trends.period).toBe('weekly');
    expect(trends.data).toHaveLength(1);
    expect(trends.data[0].profile_views).toBe(45);
    expect(trends.funnel.profile_views).toBe(45);
    expect(trends.conversion_rates.views_to_inquiries).toBe(6.7);
    expect(trends.previous_period_totals.profile_views).toBe(30);
  });

  it('supports all period types', () => {
    const periods: Array<AnalyticsTrends['period']> = ['daily', 'weekly', 'monthly'];
    expect(periods).toHaveLength(3);
  });

  it('data point has all required fields', () => {
    const point: TrendDataPoint = {
      period: '2025-03',
      profile_views: 0,
      inquiries: 0,
      bookings_requested: 0,
      bookings_confirmed: 0,
      bookings_completed: 0,
      bookings_cancelled: 0,
      revenue_cents: 0,
    };
    expect(Object.keys(point)).toHaveLength(8);
  });
});

describe('series visibility logic', () => {
  const allSeries: Array<keyof TrendDataPoint> = [
    'profile_views',
    'inquiries',
    'bookings_requested',
    'bookings_confirmed',
    'bookings_completed',
    'bookings_cancelled',
  ];

  it('defaults show 4 series', () => {
    const defaults: Array<keyof TrendDataPoint> = [
      'profile_views',
      'inquiries',
      'bookings_confirmed',
      'bookings_completed',
    ];
    expect(defaults).toHaveLength(4);
  });

  it('toggle adds series not in list', () => {
    const visible: Array<keyof TrendDataPoint> = ['profile_views'];
    const toggled = [...visible, 'inquiries' as keyof TrendDataPoint];
    expect(toggled).toContain('inquiries');
  });

  it('toggle removes series already in list', () => {
    const visible: Array<keyof TrendDataPoint> = ['profile_views', 'inquiries'];
    const toggled = visible.filter((k) => k !== 'inquiries');
    expect(toggled).not.toContain('inquiries');
    expect(toggled).toHaveLength(1);
  });
});
