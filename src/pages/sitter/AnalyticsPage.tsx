import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { BarChart3, Users, DollarSign, Star, TrendingUp, Clock, Eye } from 'lucide-react';
import { API_BASE } from '../../config';
import { startOfMonth, addMonths, addDays, subMonths, format } from 'date-fns';
import type { AnalyticsOverview, ClientSummary, RevenueDataPoint, ProfileViewsData } from '../../types';

export type AnalyticsPeriod = 'this_month' | 'last_3_months' | 'last_6_months' | 'this_year' | 'all_time';

export interface PeriodDateRange {
  readonly start: string | null;
  readonly end: string | null;
  readonly year: number | null;
  readonly all?: boolean;
}

export const PERIOD_OPTIONS: ReadonlyArray<{ value: AnalyticsPeriod; label: string }> = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_3_months', label: 'Last 3 months' },
  { value: 'last_6_months', label: 'Last 6 months' },
  { value: 'this_year', label: 'This year' },
  { value: 'all_time', label: 'All time' },
];

export function computePeriodRange(period: AnalyticsPeriod, now: Date = new Date()): PeriodDateRange {
  switch (period) {
    case 'this_month':
      return {
        start: format(startOfMonth(now), 'yyyy-MM-dd'),
        end: format(addMonths(startOfMonth(now), 1), 'yyyy-MM-dd'),
        year: null,
      };
    case 'last_3_months':
      return {
        start: format(subMonths(now, 3), 'yyyy-MM-dd'),
        end: format(addDays(now, 1), 'yyyy-MM-dd'),
        year: null,
      };
    case 'last_6_months':
      return {
        start: format(subMonths(now, 6), 'yyyy-MM-dd'),
        end: format(addDays(now, 1), 'yyyy-MM-dd'),
        year: null,
      };
    case 'this_year':
      return {
        start: `${now.getFullYear()}-01-01`,
        end: `${now.getFullYear() + 1}-01-01`,
        year: now.getFullYear(),
      };
    case 'all_time':
      return { start: null, end: null, year: null, all: true };
    default:
      return { start: null, end: null, year: null };
  }
}

function formatCurrency(n: number) {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface StatsCardProps {
  readonly label: string;
  readonly value: string;
  readonly icon: React.ReactNode;
  readonly sub?: string;
}

function StatsCard({ label, value, icon, sub }: StatsCardProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 flex items-start gap-4">
      <div className="bg-emerald-50 rounded-xl p-3 text-emerald-600">{icon}</div>
      <div>
        <p className="text-sm text-stone-500">{label}</p>
        <p className="text-2xl font-bold text-stone-900">{value}</p>
        {sub && <p className="text-xs text-stone-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

interface RevenueBarChartProps {
  readonly data: RevenueDataPoint[];
}

function RevenueBarChart({ data }: RevenueBarChartProps) {
  const maxRevenue = data.reduce((max, d) => Math.max(max, d.revenue_cents), 0);

  if (data.length === 0) {
    return <p className="text-stone-400 text-sm py-8 text-center">No revenue data yet.</p>;
  }

  return (
    <div className="flex items-end gap-2 h-48">
      {data.map((d) => {
        const heightPct = maxRevenue > 0 ? (d.revenue_cents / maxRevenue) * 100 : 0;
        return (
          <div key={d.period} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-[10px] text-stone-500">{formatCurrency(d.revenue_cents / 100)}</span>
            <div
              className="w-full bg-emerald-500 rounded-t-md transition-all"
              style={{ height: `${Math.max(heightPct, 2)}%` }}
              title={`${d.period}: ${formatCurrency(d.revenue_cents / 100)} (${d.booking_count} bookings)`}
            />
            <span className="text-[10px] text-stone-400 truncate w-full text-center">
              {d.period.replace(/^\d{4}-/, '')}
            </span>
          </div>
        );
      })}
    </div>
  );
}

interface ViewsBarChartProps {
  readonly data: ReadonlyArray<{ date: string; count: number }>;
}

function ViewsBarChart({ data }: ViewsBarChartProps) {
  const maxCount = data.reduce((max, d) => Math.max(max, d.count), 0);

  if (data.length === 0) {
    return <p className="text-stone-400 text-sm py-8 text-center">No view data yet.</p>;
  }

  return (
    <div className="flex items-end gap-1 h-48 overflow-x-auto">
      {data.map((d) => {
        const heightPct = maxCount > 0 ? (d.count / maxCount) * 100 : 0;
        return (
          <div key={d.date} className="flex-1 min-w-[20px] flex flex-col items-center gap-1">
            <span className="text-[10px] text-stone-500">{d.count}</span>
            <div
              className="w-full bg-blue-500 rounded-t-md transition-all"
              style={{ height: `${Math.max(heightPct, 2)}%` }}
              title={`${d.date}: ${d.count} views`}
            />
            <span className="text-[10px] text-stone-400 truncate w-full text-center">
              {d.date.slice(5)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function buildAnalyticsParams(range: PeriodDateRange): string {
  const params = new URLSearchParams();
  if (range.all) {
    params.set('all', 'true');
    return params.toString();
  }
  if (range.year !== null) {
    params.set('year', String(range.year));
  }
  if (range.start) params.set('start', range.start);
  if (range.end) params.set('end', range.end);
  return params.toString();
}

function buildRevenueParams(range: PeriodDateRange): string {
  const params = new URLSearchParams();
  params.set('period', 'monthly');
  if (range.all) {
    params.set('all', 'true');
    return params.toString();
  }
  if (range.year !== null) {
    params.set('year', String(range.year));
  }
  if (range.start) params.set('start', range.start);
  if (range.end) params.set('end', range.end);
  return params.toString();
}

export default function AnalyticsPage({ embedded = false }: { embedded?: boolean }) {
  const { user, token, loading: authLoading } = useAuth();

  const [period, setPeriod] = useState<AnalyticsPeriod>('this_year');
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [revenueData, setRevenueData] = useState<RevenueDataPoint[]>([]);
  const [viewsData, setViewsData] = useState<ProfileViewsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isSitter = user?.roles?.includes('sitter') ?? false;

  useEffect(() => {
    if (!user || !isSitter) return;
    const controller = new AbortController();

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const headers = getAuthHeaders(token);
        const opts = { headers, signal: controller.signal };
        const range = computePeriodRange(period);

        const overviewQuery = buildAnalyticsParams(range);
        const revenueQuery = buildRevenueParams(range);

        const [overviewRes, clientsRes, revenueRes, viewsRes] = await Promise.all([
          fetch(`${API_BASE}/analytics/overview?${overviewQuery}`, opts),
          fetch(`${API_BASE}/analytics/clients?limit=50&offset=0`, opts),
          fetch(`${API_BASE}/analytics/revenue?${revenueQuery}`, opts),
          fetch(`${API_BASE}/analytics/views?${overviewQuery}`, opts),
        ]);

        if (!overviewRes.ok || !clientsRes.ok || !revenueRes.ok) {
          setError('Failed to load analytics data.');
          setLoading(false);
          return;
        }

        const [overviewJson, clientsJson, revenueJson] = await Promise.all([
          overviewRes.json(),
          clientsRes.json(),
          revenueRes.json(),
        ]);
        const viewsJson = viewsRes.ok ? await viewsRes.json() : null;

        setOverview(overviewJson);
        setClients(clientsJson.clients);
        setRevenueData(revenueJson.data);
        setViewsData(viewsJson);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError('Failed to load analytics data.');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    return () => controller.abort();
  }, [user, token, period, isSitter]);

  if (!embedded) {
    if (authLoading) {
      return (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600" />
        </div>
      );
    }
    if (!user) return <Navigate to="/login" replace />;
    if (!isSitter) {
      return (
        <div className="max-w-2xl mx-auto px-4 py-12 text-center">
          <h1 className="text-2xl font-bold text-stone-900 mb-2">Access Denied</h1>
          <p className="text-stone-500">Analytics is only available for sitter accounts.</p>
        </div>
      );
    }
  }

  return (
    <div className={embedded ? '' : 'max-w-6xl mx-auto px-4 py-8'}>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-7 w-7 text-emerald-600" />
          <h1 className="text-2xl font-bold text-stone-900">Analytics</h1>
        </div>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as AnalyticsPeriod)}
          className="border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white"
        >
          {PERIOD_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600" />
        </div>
      ) : (
        <>
          {/* Stats Cards */}
          {overview && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
              <StatsCard
                label="Total Revenue"
                value={formatCurrency(overview.total_revenue_cents / 100)}
                icon={<DollarSign className="h-5 w-5" />}
                sub={`${overview.completed_bookings} completed bookings`}
              />
              <StatsCard
                label="Total Bookings"
                value={String(overview.total_bookings)}
                icon={<TrendingUp className="h-5 w-5" />}
                sub={`${overview.completion_rate}% completion rate`}
              />
              <StatsCard
                label="Profile Views"
                value={String(overview.profile_views)}
                icon={<Eye className="h-5 w-5" />}
                sub={viewsData?.views_by_source?.map((s) => `${s.count} ${s.source}`).join(', ') || undefined}
              />
              <StatsCard
                label="Avg Rating"
                value={overview.avg_rating !== null ? String(overview.avg_rating) : 'N/A'}
                icon={<Star className="h-5 w-5" />}
                sub={`${overview.review_count} reviews`}
              />
              <StatsCard
                label="Repeat Clients"
                value={`${overview.repeat_client_pct}%`}
                icon={<Users className="h-5 w-5" />}
                sub={`${overview.unique_clients} unique clients`}
              />
              <StatsCard
                label="Avg Response"
                value={overview.avg_response_hours !== null ? `${overview.avg_response_hours}h` : 'N/A'}
                icon={<Clock className="h-5 w-5" />}
              />
            </div>
          )}

          {/* Revenue Chart */}
          <div className="bg-white rounded-2xl shadow-sm p-6 mb-8">
            <h2 className="text-lg font-semibold text-stone-900 mb-4">Monthly Revenue</h2>
            <RevenueBarChart data={revenueData} />
          </div>

          {/* Profile Views Chart (Pro only) */}
          {viewsData && viewsData.views_by_day.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm p-6 mb-8">
              <h2 className="text-lg font-semibold text-stone-900 mb-4">Daily Profile Views</h2>
              <ViewsBarChart data={viewsData.views_by_day} />
            </div>
          )}

          {/* Client List */}
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="text-lg font-semibold text-stone-900 mb-4">Clients</h2>
            {clients.length === 0 ? (
              <p className="text-stone-400 text-sm py-4">No clients yet.</p>
            ) : (
              <div className="divide-y divide-stone-100">
                {clients.map((client) => (
                  <div key={client.client_id} className="py-4 flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-stone-200 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {client.client_avatar ? (
                        <img src={client.client_avatar} alt={client.client_name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-stone-500 text-sm font-medium">
                          {client.client_name.charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-stone-900 truncate">{client.client_name}</p>
                      <p className="text-xs text-stone-400">
                        {client.total_bookings} booking{client.total_bookings !== 1 ? 's' : ''}
                        {' \u00b7 '}
                        Last: {new Date(client.last_booking_date).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-medium text-stone-900">{formatCurrency(client.total_spent_cents / 100)}</p>
                      {client.pets.length > 0 && (
                        <p className="text-xs text-stone-400 truncate max-w-[150px]">
                          {client.pets.map((p) => p.name).join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
