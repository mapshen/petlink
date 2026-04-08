import { useState, useEffect } from 'react';
import { DollarSign } from 'lucide-react';
import { getAuthHeaders } from '../../context/AuthContext';
import { API_BASE } from '../../config';
import { formatCents } from '../../lib/money';
import type { Booking } from '../../types';

interface EarningsSectionProps {
  readonly year: number;
  readonly token: string | null;
  readonly isSitter: boolean;
  readonly userId: number;
}

export default function EarningsSection({ year, token, isSitter, userId }: EarningsSectionProps) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchBookings = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_BASE}/bookings`, { headers: getAuthHeaders(token) });
        if (res.ok) {
          const data = await res.json();
          setBookings(data.bookings);
        }
      } catch {
        // Non-critical
      } finally {
        setLoading(false);
      }
    };
    fetchBookings();
  }, [token, year]);

  const completedBookings = bookings.filter(b => b.status === 'completed');
  const earnings = isSitter
    ? completedBookings.filter(b => b.sitter_id === userId)
    : completedBookings.filter(b => b.owner_id === userId);
  const earningsThisYear = earnings.filter(b => new Date(b.start_time).getFullYear() === year);
  const totalEarnings = earningsThisYear.reduce((sum, b) => sum + (b.total_price_cents || 0), 0);
  const label = isSitter ? 'earnings' : 'payments';

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (earningsThisYear.length === 0) {
    return (
      <div className="text-center py-12 bg-stone-50 rounded-xl border border-stone-200">
        <DollarSign className="w-12 h-12 mx-auto mb-4 text-stone-300" />
        <p className="text-stone-500">No {label} for {year}.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {earningsThisYear.map(booking => (
        <div key={booking.id} className="bg-white rounded-xl border border-stone-100 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-xs font-bold">
              {(isSitter ? booking.owner_name : booking.sitter_name)?.charAt(0)?.toUpperCase()}
            </div>
            <div>
              <div className="text-sm font-medium text-stone-900 capitalize">{booking.service_type?.replace(/[-_]/g, ' ')}</div>
              <div className="text-xs text-stone-400">
                {isSitter ? booking.owner_name : booking.sitter_name} &middot; {new Date(booking.start_time).toLocaleDateString()}
              </div>
            </div>
          </div>
          <span className={`text-sm font-bold ${isSitter ? 'text-emerald-600' : 'text-stone-900'}`}>
            {isSitter ? '+' : '-'}{formatCents(booking.total_price_cents || 0)}
          </span>
        </div>
      ))}
      <div className="mt-4 p-4 bg-stone-50 rounded-xl border border-stone-200 flex items-center justify-between">
        <span className="text-sm font-medium text-stone-700">Total ({year})</span>
        <span className="text-lg font-bold text-emerald-700">{formatCents(totalEarnings)}</span>
      </div>
    </div>
  );
}
