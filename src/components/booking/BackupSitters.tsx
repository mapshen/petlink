import { useState, useEffect, useCallback } from 'react';
import { Shield, Star, RefreshCw, MapPin } from 'lucide-react';
import { getAuthHeaders } from '../../context/AuthContext';
import { API_BASE } from '../../config';
import type { BookingBackup } from '../../types';

interface Props {
  readonly bookingId: number;
  readonly bookingStatus: string;
  readonly isOwner: boolean;
  readonly token: string | null;
}

function formatDistance(meters: number | undefined): string {
  if (meters == null) return '';
  const miles = meters / 1609.34;
  if (miles < 0.1) return 'Nearby';
  return `${miles.toFixed(1)} mi away`;
}

function formatRating(rating: number | null | undefined): string {
  if (rating == null) return 'New';
  return rating.toFixed(1);
}

function formatPrice(cents: number | undefined): string {
  if (cents == null) return '';
  return `$${(cents / 100).toFixed(0)}`;
}

export default function BackupSitters({ bookingId, bookingStatus, isOwner, token }: Props) {
  const [backups, setBackups] = useState<BookingBackup[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const isConfirmed = bookingStatus === 'confirmed' || bookingStatus === 'in_progress';

  const fetchBackups = useCallback(async () => {
    if (!isOwner || !isConfirmed) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/bookings/${bookingId}/backups`, {
        headers: getAuthHeaders(token),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to load backup sitters');
        return;
      }
      const data = await res.json();
      setBackups(data.backups || []);
    } catch {
      setError('Failed to load backup sitters');
    } finally {
      setLoading(false);
    }
  }, [bookingId, isOwner, isConfirmed, token]);

  useEffect(() => {
    fetchBackups();
  }, [fetchBackups]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/bookings/${bookingId}/backups/generate`, {
        method: 'POST',
        headers: getAuthHeaders(token),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to generate backup sitters');
        return;
      }
      const data = await res.json();
      setBackups(data.backups || []);
    } catch {
      setError('Failed to generate backup sitters');
    } finally {
      setGenerating(false);
    }
  };

  if (!isOwner || !isConfirmed) return null;

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-emerald-600" />
          <h3 className="text-base font-semibold text-stone-900">Backup Sitters</h3>
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${generating ? 'animate-spin' : ''}`} />
          {generating ? 'Finding...' : 'Refresh'}
        </button>
      </div>

      <p className="text-sm text-stone-500 mb-4">
        Suggested alternatives in case your sitter cancels.
      </p>

      {error && (
        <p className="text-sm text-red-600 mb-3">{error}</p>
      )}

      {loading && (
        <div className="flex items-center justify-center py-6">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
        </div>
      )}

      {!loading && backups.length === 0 && !error && (
        <p className="text-sm text-stone-400 text-center py-4">
          No backup sitters found in your area yet.
        </p>
      )}

      {!loading && backups.length > 0 && (
        <div className="space-y-3">
          {backups.map((backup) => (
            <a
              key={backup.id}
              href={`/sitter/${backup.slug || backup.sitter_id}`}
              className="flex items-center gap-3 rounded-xl border border-stone-100 p-3 hover:bg-stone-50 transition-colors"
            >
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-stone-200">
                {backup.avatar_url ? (
                  <img src={backup.avatar_url} alt={backup.name || ''} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-stone-400 text-sm font-medium">
                    {(backup.name || '?')[0]}
                  </div>
                )}
                <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700">
                  {backup.rank}
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-stone-900 truncate">{backup.name}</p>
                <div className="flex items-center gap-2 text-xs text-stone-500">
                  {backup.avg_rating != null && (
                    <span className="flex items-center gap-0.5">
                      <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                      {formatRating(backup.avg_rating)}
                      {backup.review_count != null && (
                        <span className="text-stone-400">({backup.review_count})</span>
                      )}
                    </span>
                  )}
                  {backup.avg_rating == null && (
                    <span className="text-stone-400">New sitter</span>
                  )}
                </div>
              </div>

              <div className="text-right shrink-0">
                {backup.price_cents != null && (
                  <p className="text-sm font-semibold text-stone-900">{formatPrice(backup.price_cents)}</p>
                )}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
