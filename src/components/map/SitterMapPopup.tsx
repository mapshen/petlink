import React from 'react';
import { Link } from 'react-router-dom';
import { Star, ShieldCheck } from 'lucide-react';
import { getDisplayName } from '../../shared/display-name';
import { metersToMiles } from '../../lib/geo';
import { formatCents } from '../../lib/money';

interface SitterPopupData {
  readonly id: number;
  readonly name: string;
  readonly slug?: string;
  readonly avatar_url?: string;
  readonly price_cents: number;
  readonly avg_rating?: number | null;
  readonly review_count?: number;
  readonly distance_meters?: number;
  readonly service_type: string;
}

interface SitterMapPopupProps {
  readonly sitter: SitterPopupData;
}

export default function SitterMapPopup({ sitter }: SitterMapPopupProps) {
  const distance = metersToMiles(sitter.distance_meters);

  return (
    <div className="w-52">
      <div className="flex items-center gap-3 mb-2">
        <img
          src={sitter.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(sitter.name)}&size=40`}
          alt={sitter.name}
          className="w-10 h-10 rounded-full object-cover border border-stone-200"
        />
        <div className="min-w-0">
          <h4 className="font-bold text-stone-900 text-sm truncate">{getDisplayName(sitter.name)}</h4>
          {distance && (
            <span className="text-xs text-stone-400">{distance} away</span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-xs">
          {sitter.avg_rating ? (
            <span className="flex items-center gap-0.5 text-amber-500">
              <Star className="w-3 h-3 fill-current" />
              {sitter.avg_rating} ({sitter.review_count})
            </span>
          ) : (
            <span className="text-stone-400">New</span>
          )}
          <span className="flex items-center gap-0.5 text-emerald-600">
            <ShieldCheck className="w-3 h-3" />
            Verified
          </span>
        </div>
        <span className="font-bold text-emerald-600 text-sm">
          {sitter.price_cents === 0 ? 'Free' : formatCents(sitter.price_cents)}
        </span>
      </div>

      <Link
        to={`/sitter/${sitter.slug || sitter.id}`}
        className="block w-full text-center bg-emerald-600 text-white text-xs font-medium py-1.5 rounded-lg hover:bg-emerald-700 transition-colors"
      >
        View Profile
      </Link>
    </div>
  );
}
