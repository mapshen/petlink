import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Eye, Search, TrendingUp } from 'lucide-react';
import { getAuthHeaders } from '../../context/AuthContext';
import { API_BASE } from '../../config';

interface OwnerInsightsStripProps {
  token: string | null;
}

interface AnalyticsOverview {
  profile_views_30d?: number;
  search_appearances_30d?: number;
  booking_conversion_rate?: number;
}

export default function OwnerInsightsStrip({ token }: OwnerInsightsStripProps) {
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!token) return;
    setError(false);
    fetch(`${API_BASE}/analytics/overview`, { headers: getAuthHeaders(token) })
      .then(r => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(d => setData(d))
      .catch(() => setError(true));
  }, [token]);

  if (error) {
    return (
      <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 mb-4 text-center">
        <p className="text-xs text-stone-400">Could not load profile insights</p>
      </div>
    );
  }

  return (
    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-emerald-600" />
            <div>
              <div className="text-sm font-semibold text-stone-800">{data?.profile_views_30d ?? '—'}</div>
              <div className="text-[10px] text-stone-500">Profile views (30d)</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-emerald-600" />
            <div>
              <div className="text-sm font-semibold text-stone-800">{data?.search_appearances_30d ?? '—'}</div>
              <div className="text-[10px] text-stone-500">Search appearances</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <div>
              <div className="text-sm font-semibold text-stone-800">
                {data?.booking_conversion_rate != null ? `${Math.round(data.booking_conversion_rate)}%` : '—'}
              </div>
              <div className="text-[10px] text-stone-500">Conversion</div>
            </div>
          </div>
        </div>
        <Link to="/analytics" className="text-xs text-emerald-600 font-medium hover:text-emerald-700">
          View analytics
        </Link>
      </div>
    </div>
  );
}
