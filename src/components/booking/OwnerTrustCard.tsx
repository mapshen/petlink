import React, { useEffect, useState } from 'react';
import { Star, Calendar, ShieldCheck, PawPrint, ChevronDown, ChevronUp } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { OwnerTrustProfile } from '../../types';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { API_BASE } from '../../config';

interface OwnerTrustCardProps {
  readonly ownerId: number;
  readonly compact?: boolean;
}

export default function OwnerTrustCard({ ownerId, compact = false }: OwnerTrustCardProps) {
  const { token } = useAuth();
  const [profile, setProfile] = useState<OwnerTrustProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(!compact);

  useEffect(() => {
    if (!token || !ownerId) { setLoading(false); return; }
    const controller = new AbortController();
    fetch(`${API_BASE}/owners/${ownerId}/trust-profile`, {
      headers: getAuthHeaders(token),
      signal: controller.signal,
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.profile) setProfile(data.profile); })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [token, ownerId]);

  if (loading || !profile) return null;

  const hasBadges = profile.badges.length > 0;

  if (compact && !expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-stone-50 rounded-lg text-xs text-stone-500 hover:bg-stone-100 transition-colors"
      >
        <span className="font-medium text-stone-700">{profile.name}</span>
        {profile.avg_rating && (
          <span className="flex items-center gap-0.5 text-amber-500">
            <Star className="w-3 h-3 fill-current" />{profile.avg_rating}
          </span>
        )}
        <span>{profile.completed_bookings} bookings</span>
        {hasBadges && profile.badges.map(b => (
          <span key={b} className="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full text-[10px] font-medium">
            {b === 'verified_owner' && 'Verified'}
          </span>
        ))}
        <ChevronDown className="w-3 h-3 ml-auto" />
      </button>
    );
  }

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4 text-sm">
      {compact && (
        <button onClick={() => setExpanded(false)} className="float-right text-stone-400 hover:text-stone-600">
          <ChevronUp className="w-4 h-4" />
        </button>
      )}

      <div className="flex items-center gap-3 mb-3">
        <img
          src={profile.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name)}`}
          alt={profile.name}
          className="w-10 h-10 rounded-full"
        />
        <div>
          <div className="font-bold text-stone-900">{profile.name}</div>
          <div className="text-xs text-stone-400 flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            Member {formatDistanceToNow(new Date(profile.member_since), { addSuffix: false })}
          </div>
        </div>
      </div>

      {/* Badges */}
      {hasBadges && (
        <div className="flex gap-2 mb-3">
          {profile.badges.includes('verified_owner') && (
            <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-xs font-medium">
              <ShieldCheck className="w-3 h-3" /> Verified Owner
            </span>
          )}
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="font-bold text-stone-900">{profile.completed_bookings}</div>
          <div className="text-[10px] text-stone-400">Bookings</div>
        </div>
        <div>
          <div className="font-bold text-stone-900 flex items-center justify-center gap-1">
            {profile.avg_rating ? (
              <><Star className="w-3 h-3 text-amber-500 fill-current" />{profile.avg_rating}</>
            ) : (
              <span className="text-stone-300">--</span>
            )}
          </div>
          <div className="text-[10px] text-stone-400">{profile.review_count} reviews</div>
        </div>
        <div>
          <div className="font-bold text-stone-900 flex items-center justify-center gap-1">
            <PawPrint className="w-3 h-3 text-emerald-600" />{profile.pet_count}
          </div>
          <div className="text-[10px] text-stone-400">Pets</div>
        </div>
      </div>

      {/* Cancellation rate (only if > 0) */}
      {profile.cancellation_rate > 0 && (
        <div className="mt-3 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-lg">
          {Math.round(profile.cancellation_rate * 100)}% cancellation rate
        </div>
      )}
    </div>
  );
}
