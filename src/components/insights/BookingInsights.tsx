import React, { useState, useEffect } from 'react';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { API_BASE } from '../../config';
import {
  Lightbulb,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { BookingInsights as BookingInsightsType, InsightFactor, Recommendation } from '../../types';

const STATUS_STYLES: Record<InsightFactor['status'], { bg: string; text: string; icon: React.ReactNode }> = {
  good: {
    bg: 'bg-emerald-50 border-emerald-200',
    text: 'text-emerald-700',
    icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
  },
  warning: {
    bg: 'bg-amber-50 border-amber-200',
    text: 'text-amber-700',
    icon: <AlertTriangle className="w-4 h-4 text-amber-500" />,
  },
  critical: {
    bg: 'bg-red-50 border-red-200',
    text: 'text-red-700',
    icon: <XCircle className="w-4 h-4 text-red-500" />,
  },
};

const IMPACT_STYLES: Record<Recommendation['impact'], string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-stone-100 text-stone-600',
};

const TREND_CONFIG: Record<BookingInsightsType['booking_trend'], { label: string; icon: React.ReactNode; color: string }> = {
  up: { label: 'Bookings trending up', icon: <TrendingUp className="w-4 h-4" />, color: 'text-emerald-600' },
  down: { label: 'Bookings trending down', icon: <TrendingDown className="w-4 h-4" />, color: 'text-red-600' },
  stable: { label: 'Bookings stable', icon: <Minus className="w-4 h-4" />, color: 'text-stone-500' },
  new: { label: 'No booking history yet', icon: <Sparkles className="w-4 h-4" />, color: 'text-blue-600' },
};

function ProfileCompletenessRing({ pct }: { readonly pct: number }) {
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  const color = pct >= 80 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="88" height="88" viewBox="0 0 88 88" className="-rotate-90">
        <circle cx="44" cy="44" r={radius} fill="none" stroke="#e7e5e4" strokeWidth="6" />
        <circle
          cx="44"
          cy="44"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <span className="absolute text-lg font-bold text-stone-900">{pct}%</span>
    </div>
  );
}

function FactorCard({ factor }: { readonly factor: InsightFactor }) {
  const [expanded, setExpanded] = useState(false);
  const style = STATUS_STYLES[factor.status];

  return (
    <button
      onClick={() => setExpanded(!expanded)}
      className={`w-full text-left border rounded-xl p-3 transition-colors ${style.bg}`}
      aria-expanded={expanded}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {style.icon}
          <span className="text-sm font-medium text-stone-900">{factor.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold ${style.text}`}>{factor.value}</span>
          {expanded ? <ChevronUp className="w-3.5 h-3.5 text-stone-400" /> : <ChevronDown className="w-3.5 h-3.5 text-stone-400" />}
        </div>
      </div>
      {expanded && (
        <p className="mt-2 text-xs text-stone-600 leading-relaxed">{factor.detail}</p>
      )}
    </button>
  );
}

function RecommendationItem({ rec }: { readonly rec: Recommendation }) {
  return (
    <li className="flex items-start gap-3 py-2">
      <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${IMPACT_STYLES[rec.impact]} flex-shrink-0 mt-0.5`}>
        {rec.impact}
      </span>
      <span className="text-sm text-stone-700">{rec.action}</span>
    </li>
  );
}

export default function BookingInsights() {
  const { token } = useAuth();
  const [insights, setInsights] = useState<BookingInsightsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const fetchInsights = async () => {
      try {
        const res = await fetch(`${API_BASE}/insights/me`, {
          headers: getAuthHeaders(token),
          signal: controller.signal,
        });
        if (!res.ok) {
          throw new Error('Failed to load insights');
        }
        const data = await res.json();
        setInsights(data);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError('Failed to load booking insights.');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchInsights();
    return () => controller.abort();
  }, [token]);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Lightbulb className="w-5 h-5 text-amber-500" />
          <h2 className="text-lg font-semibold text-stone-900">Booking Insights</h2>
        </div>
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
        </div>
      </div>
    );
  }

  if (error || !insights) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6">
        <div className="flex items-center gap-3 mb-4">
          <Lightbulb className="w-5 h-5 text-amber-500" />
          <h2 className="text-lg font-semibold text-stone-900">Booking Insights</h2>
        </div>
        <p className="text-sm text-stone-500">{error || 'Unable to load insights.'}</p>
      </div>
    );
  }

  const trend = TREND_CONFIG[insights.booking_trend];
  const criticalCount = insights.factors.filter((f) => f.status === 'critical').length;
  const warningCount = insights.factors.filter((f) => f.status === 'warning').length;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Lightbulb className="w-5 h-5 text-amber-500" />
          <h2 className="text-lg font-semibold text-stone-900">Booking Insights</h2>
        </div>
        <div className={`flex items-center gap-1.5 text-sm font-medium ${trend.color}`}>
          {trend.icon}
          <span>{trend.label}</span>
        </div>
      </div>

      {/* Profile completeness + summary */}
      <div className="flex items-center gap-6 mb-6 pb-6 border-b border-stone-100">
        <ProfileCompletenessRing pct={insights.profile_completeness_pct} />
        <div>
          <p className="text-sm font-medium text-stone-900">Profile Completeness</p>
          <p className="text-xs text-stone-500 mt-1">
            {criticalCount > 0 && (
              <span className="text-red-600 font-medium">{criticalCount} critical issue{criticalCount !== 1 ? 's' : ''}</span>
            )}
            {criticalCount > 0 && warningCount > 0 && ' and '}
            {warningCount > 0 && (
              <span className="text-amber-600 font-medium">{warningCount} warning{warningCount !== 1 ? 's' : ''}</span>
            )}
            {criticalCount === 0 && warningCount === 0 && (
              <span className="text-emerald-600 font-medium">Looking great! All factors are healthy.</span>
            )}
          </p>
        </div>
      </div>

      {/* Factors */}
      <div className="space-y-2 mb-6">
        <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">Diagnostic Factors</h3>
        {insights.factors.map((factor) => (
          <FactorCard key={factor.key} factor={factor} />
        ))}
      </div>

      {/* Recommendations */}
      {insights.recommendations.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">Recommended Actions</h3>
          <ul className="divide-y divide-stone-100">
            {insights.recommendations.map((rec, i) => (
              <RecommendationItem key={i} rec={rec} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
