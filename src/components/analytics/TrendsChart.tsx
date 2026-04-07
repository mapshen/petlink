import React, { useState, useEffect, useMemo } from 'react';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { API_BASE } from '../../config';
import { TrendingUp, TrendingDown, Minus, ArrowRight, Eye, MessageSquare, CalendarCheck, CheckCircle2 } from 'lucide-react';
import { formatCents } from '../../lib/money';
import type { AnalyticsTrends, TrendsPeriod, TrendDataPoint } from '../../types';

type TrendsRange = 30 | 90 | 365;

const PERIOD_OPTIONS: ReadonlyArray<{ value: TrendsPeriod; label: string }> = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const RANGE_OPTIONS: ReadonlyArray<{ value: TrendsRange; label: string }> = [
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 365, label: '1 year' },
];

interface DeltaIndicatorProps {
  readonly current: number;
  readonly previous: number;
  readonly isCurrency?: boolean;
}

function DeltaIndicator({ current, previous, isCurrency = false }: DeltaIndicatorProps) {
  if (previous === 0 && current === 0) {
    return <span className="text-xs text-stone-400 flex items-center gap-0.5"><Minus className="w-3 h-3" /> No change</span>;
  }

  if (previous === 0) {
    return <span className="text-xs text-emerald-600 flex items-center gap-0.5"><TrendingUp className="w-3 h-3" /> New</span>;
  }

  const pctChange = Math.round(((current - previous) / previous) * 100);

  if (pctChange === 0) {
    return <span className="text-xs text-stone-400 flex items-center gap-0.5"><Minus className="w-3 h-3" /> 0%</span>;
  }

  if (pctChange > 0) {
    return <span className="text-xs text-emerald-600 flex items-center gap-0.5"><TrendingUp className="w-3 h-3" /> +{pctChange}%</span>;
  }

  return <span className="text-xs text-red-500 flex items-center gap-0.5"><TrendingDown className="w-3 h-3" /> {pctChange}%</span>;
}

interface BarGroupChartProps {
  readonly data: ReadonlyArray<TrendDataPoint>;
  readonly visibleSeries: ReadonlyArray<keyof TrendDataPoint>;
}

const SERIES_CONFIG: Record<string, { color: string; label: string }> = {
  profile_views: { color: 'bg-blue-400', label: 'Views' },
  inquiries: { color: 'bg-amber-400', label: 'Inquiries' },
  bookings_requested: { color: 'bg-purple-400', label: 'Requested' },
  bookings_confirmed: { color: 'bg-emerald-400', label: 'Confirmed' },
  bookings_completed: { color: 'bg-emerald-600', label: 'Completed' },
  bookings_cancelled: { color: 'bg-red-400', label: 'Cancelled' },
};

function BarGroupChart({ data, visibleSeries }: BarGroupChartProps) {
  const maxValue = useMemo(() =>
    data.reduce((max, point) =>
      visibleSeries.reduce((m, key) => Math.max(m, point[key] as number), max),
    0),
  [data, visibleSeries]);

  if (data.length === 0) {
    return <p className="text-stone-400 text-sm py-8 text-center">No trend data yet.</p>;
  }

  return (
    <div className="space-y-3">
      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-2">
        {visibleSeries.map((key) => {
          const config = SERIES_CONFIG[key as string];
          if (!config) return null;
          return (
            <div key={key as string} className="flex items-center gap-1.5 text-xs text-stone-600">
              <div className={`w-2.5 h-2.5 rounded-sm ${config.color}`} />
              {config.label}
            </div>
          );
        })}
      </div>

      {/* Chart */}
      <div className="flex items-end gap-1.5 h-48 overflow-x-auto pb-1">
        {data.map((point) => (
          <div key={point.period} className="flex-1 min-w-[32px] flex flex-col items-center gap-1">
            <div className="flex items-end gap-px w-full h-40">
              {visibleSeries.map((key) => {
                const val = point[key] as number;
                const heightPct = maxValue > 0 ? (val / maxValue) * 100 : 0;
                const config = SERIES_CONFIG[key as string];
                if (!config) return null;
                return (
                  <div
                    key={key as string}
                    className={`flex-1 ${config.color} rounded-t-sm transition-all min-h-[2px]`}
                    style={{ height: `${Math.max(heightPct, 1)}%` }}
                    title={`${config.label}: ${val}`}
                  />
                );
              })}
            </div>
            <span className="text-[9px] text-stone-400 truncate w-full text-center">
              {formatPeriodLabel(point.period)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatPeriodLabel(period: string): string {
  // YYYY-MM-DD -> MM-DD, YYYY-WIW -> WIW, YYYY-MM -> MM
  if (period.includes('W')) return period.replace(/^\d{4}-/, '');
  if (period.length === 10) return period.slice(5);
  return period.replace(/^\d{4}-/, '');
}

interface FunnelStepProps {
  readonly label: string;
  readonly value: number;
  readonly icon: React.ReactNode;
  readonly widthPct: number;
  readonly color: string;
}

function FunnelStep({ label, value, icon, widthPct, color }: FunnelStepProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-shrink-0 w-24 text-right">
        <div className="text-xs text-stone-500">{label}</div>
        <div className="text-lg font-bold text-stone-900">{value}</div>
      </div>
      <div className="flex-1">
        <div
          className={`h-8 ${color} rounded-md transition-all flex items-center justify-end pr-2`}
          style={{ width: `${Math.max(widthPct, 3)}%` }}
        >
          <span className="text-white text-xs font-medium">{icon}</span>
        </div>
      </div>
    </div>
  );
}

interface ConversionFunnelCardProps {
  readonly trends: AnalyticsTrends;
}

function ConversionFunnelCard({ trends }: ConversionFunnelCardProps) {
  const { funnel, conversion_rates } = trends;
  const maxVal = Math.max(funnel.profile_views, 1);

  const steps = [
    { label: 'Views', value: funnel.profile_views, icon: <Eye className="w-3.5 h-3.5" />, color: 'bg-blue-400' },
    { label: 'Inquiries', value: funnel.inquiries, icon: <MessageSquare className="w-3.5 h-3.5" />, color: 'bg-amber-400' },
    { label: 'Requested', value: funnel.bookings_requested, icon: <CalendarCheck className="w-3.5 h-3.5" />, color: 'bg-purple-400' },
    { label: 'Confirmed', value: funnel.bookings_confirmed, icon: <CalendarCheck className="w-3.5 h-3.5" />, color: 'bg-emerald-400' },
    { label: 'Completed', value: funnel.bookings_completed, icon: <CheckCircle2 className="w-3.5 h-3.5" />, color: 'bg-emerald-600' },
  ];

  const rates = [
    conversion_rates.views_to_inquiries,
    conversion_rates.inquiries_to_bookings,
    conversion_rates.bookings_to_confirmed,
    conversion_rates.confirmed_to_completed,
  ];

  return (
    <div className="bg-white rounded-2xl shadow-sm p-6">
      <h2 className="text-lg font-semibold text-stone-900 mb-4">Conversion Funnel</h2>
      <div className="space-y-2">
        {steps.map((step, i) => (
          <React.Fragment key={step.label}>
            <FunnelStep
              label={step.label}
              value={step.value}
              icon={step.icon}
              widthPct={(step.value / maxVal) * 100}
              color={step.color}
            />
            {i < steps.length - 1 && (
              <div className="flex items-center gap-3 pl-24">
                <ArrowRight className="w-3 h-3 text-stone-300" />
                <span className="text-xs text-stone-400">{rates[i]}% conversion</span>
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

interface PeriodComparisonCardProps {
  readonly trends: AnalyticsTrends;
}

function PeriodComparisonCard({ trends }: PeriodComparisonCardProps) {
  const { funnel, previous_period_totals } = trends;
  const totalRevenue = trends.data.reduce((s, d) => s + d.revenue_cents, 0);

  const metrics = [
    { label: 'Profile Views', current: funnel.profile_views, previous: previous_period_totals.profile_views },
    { label: 'Inquiries', current: funnel.inquiries, previous: previous_period_totals.inquiries },
    { label: 'Bookings', current: funnel.bookings_requested, previous: previous_period_totals.bookings_requested },
    { label: 'Completed', current: funnel.bookings_completed, previous: previous_period_totals.bookings_completed },
    { label: 'Revenue', current: totalRevenue, previous: previous_period_totals.revenue_cents, isCurrency: true },
  ];

  return (
    <div className="bg-white rounded-2xl shadow-sm p-6">
      <h2 className="text-lg font-semibold text-stone-900 mb-4">vs. Previous Period</h2>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        {metrics.map((m) => (
          <div key={m.label} className="text-center">
            <p className="text-xs text-stone-500 mb-1">{m.label}</p>
            <p className="text-xl font-bold text-stone-900">
              {m.isCurrency ? formatCents(m.current) : m.current}
            </p>
            <DeltaIndicator current={m.current} previous={m.previous} isCurrency={m.isCurrency} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TrendsChart() {
  const { token } = useAuth();
  const [period, setPeriod] = useState<TrendsPeriod>('weekly');
  const [range, setRange] = useState<TrendsRange>(90);
  const [trends, setTrends] = useState<AnalyticsTrends | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [visibleSeries, setVisibleSeries] = useState<Array<keyof TrendDataPoint>>([
    'profile_views',
    'inquiries',
    'bookings_confirmed',
    'bookings_completed',
  ]);

  useEffect(() => {
    const controller = new AbortController();

    const fetchTrends = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ period, range: String(range) });
        const res = await fetch(`${API_BASE}/analytics/trends?${params}`, {
          headers: getAuthHeaders(token),
          signal: controller.signal,
        });
        if (!res.ok) {
          setError('Failed to load trend data.');
          setLoading(false);
          return;
        }
        const data: AnalyticsTrends = await res.json();
        setTrends(data);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError('Failed to load trend data.');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchTrends();
    return () => controller.abort();
  }, [token, period, range]);

  const toggleSeries = (key: keyof TrendDataPoint) => {
    setVisibleSeries((prev) =>
      prev.includes(key)
        ? prev.filter((k) => k !== key)
        : [...prev, key],
    );
  };

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="bg-white rounded-2xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-lg font-semibold text-stone-900">Trends</h2>
          <div className="flex gap-2">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as TrendsPeriod)}
              className="border border-stone-300 rounded-lg px-3 py-1.5 text-sm bg-white"
            >
              {PERIOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <select
              value={range}
              onChange={(e) => setRange(Number(e.target.value) as TrendsRange)}
              className="border border-stone-300 rounded-lg px-3 py-1.5 text-sm bg-white"
            >
              {RANGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Series toggles */}
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.entries(SERIES_CONFIG).map(([key, config]) => {
            const isActive = visibleSeries.includes(key as keyof TrendDataPoint);
            return (
              <button
                key={key}
                onClick={() => toggleSeries(key as keyof TrendDataPoint)}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs border transition-all ${
                  isActive
                    ? 'border-stone-300 bg-stone-50 text-stone-700'
                    : 'border-stone-200 bg-white text-stone-400'
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${isActive ? config.color : 'bg-stone-200'}`} />
                {config.label}
              </button>
            );
          })}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 text-red-700 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
          </div>
        ) : trends ? (
          <BarGroupChart data={trends.data} visibleSeries={visibleSeries} />
        ) : null}
      </div>

      {/* Funnel + Comparison */}
      {!loading && trends && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ConversionFunnelCard trends={trends} />
          <PeriodComparisonCard trends={trends} />
        </div>
      )}
    </div>
  );
}
