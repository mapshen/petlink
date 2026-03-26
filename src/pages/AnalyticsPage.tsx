import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth, getAuthHeaders } from '../context/AuthContext';
import { BarChart3, Users, DollarSign, Star, TrendingUp, Clock } from 'lucide-react';
import { API_BASE } from '../config';
import type { AnalyticsOverview, ClientSummary, RevenueDataPoint } from '../types';

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
  const maxRevenue = data.reduce((max, d) => Math.max(max, d.revenue), 0);

  if (data.length === 0) {
    return <p className="text-stone-400 text-sm py-8 text-center">No revenue data yet.</p>;
  }

  return (
    <div className="flex items-end gap-2 h-48">
      {data.map((d) => {
        const heightPct = maxRevenue > 0 ? (d.revenue / maxRevenue) * 100 : 0;
        return (
          <div key={d.period} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-[10px] text-stone-500">{formatCurrency(d.revenue)}</span>
            <div
              className="w-full bg-emerald-500 rounded-t-md transition-all"
              style={{ height: `${Math.max(heightPct, 2)}%` }}
              title={`${d.period}: ${formatCurrency(d.revenue)} (${d.booking_count} bookings)`}
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

export default function AnalyticsPage() {
  const { user, token, loading: authLoading } = useAuth();

  const [year, setYear] = useState(new Date().getFullYear());
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [revenueData, setRevenueData] = useState<RevenueDataPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isSitter = user?.role === 'sitter' || user?.role === 'both';

  useEffect(() => {
    if (!user || !isSitter) return;
    const controller = new AbortController();

    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const headers = getAuthHeaders(token);
        const opts = { headers, signal: controller.signal };

        const [overviewRes, clientsRes, revenueRes] = await Promise.all([
          fetch(`${API_BASE}/analytics/overview?year=${year}`, opts),
          fetch(`${API_BASE}/analytics/clients?limit=50&offset=0`, opts),
          fetch(`${API_BASE}/analytics/revenue?period=monthly&year=${year}`, opts),
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

        setOverview(overviewJson);
        setClients(clientsJson.clients);
        setRevenueData(revenueJson.data);
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
  }, [user, token, year, isSitter]);

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

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: currentYear - 2019 }, (_, i) => currentYear - i);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-7 w-7 text-emerald-600" />
          <h1 className="text-2xl font-bold text-stone-900">Analytics</h1>
        </div>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="border border-stone-300 rounded-lg px-3 py-2 text-sm bg-white"
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>{y}</option>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
              <StatsCard
                label="Total Revenue"
                value={formatCurrency(overview.total_revenue)}
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
                      <p className="text-sm font-medium text-stone-900">{formatCurrency(client.total_spent)}</p>
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
