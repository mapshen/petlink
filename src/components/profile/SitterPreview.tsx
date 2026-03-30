import { Eye } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { User, Service, SitterPhoto } from '../../types';

interface Props {
  readonly user: User;
  readonly services: Service[];
  readonly photos: SitterPhoto[];
}

function formatServiceType(type: string): string {
  return type.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function SitterPreview({ user, services, photos }: Props) {
  return (
    <div className="sticky top-20">
      <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-stone-100 bg-stone-50 flex justify-between items-center">
          <div className="flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5 text-stone-500" />
            <span className="text-xs font-semibold text-stone-500">Preview</span>
          </div>
          <span className="text-[10px] text-stone-400">How owners see you</span>
        </div>

        <div className="p-5">
          {/* Avatar + Name */}
          <div className="text-center mb-4">
            <img
              src={user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&size=80`}
              alt={user.name}
              className="w-16 h-16 rounded-full border-2 border-emerald-50 mx-auto mb-2 object-cover"
            />
            <h3 className="text-lg font-extrabold">{user.name}</h3>
            <div className="flex gap-1.5 mt-1 flex-wrap justify-center">
              {user.avg_rating !== null && user.avg_rating !== undefined && (
                <span className="bg-amber-50 text-amber-700 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                  {user.avg_rating.toFixed(1)} ({user.review_count || 0})
                </span>
              )}
              {user.years_experience !== undefined && user.years_experience !== null && (
                <span className="bg-emerald-50 text-emerald-700 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                  {user.years_experience} yrs exp
                </span>
              )}
            </div>
          </div>

          {/* Bio */}
          {user.bio && (
            <div className="mb-3">
              <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wide mb-1">About</div>
              <p className="text-xs text-stone-600 leading-relaxed line-clamp-3">{user.bio}</p>
            </div>
          )}

          {/* Details tags */}
          <div className="mb-3">
            <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wide mb-1">Details</div>
            <div className="flex flex-wrap gap-1">
              {user.home_type && (
                <span className="bg-stone-50 text-stone-600 text-[11px] px-2 py-0.5 rounded-md">{user.home_type}</span>
              )}
              {user.has_yard && (
                <span className="bg-stone-50 text-stone-600 text-[11px] px-2 py-0.5 rounded-md">
                  {user.has_fenced_yard ? 'Fenced yard' : 'Yard'}
                </span>
              )}
              {user.accepted_species?.map((s) => (
                <span key={s} className="bg-stone-50 text-stone-600 text-[11px] px-2 py-0.5 rounded-md capitalize">{s.replace(/_/g, ' ')}</span>
              ))}
              {user.skills?.map((s) => (
                <span key={s} className="bg-stone-50 text-stone-600 text-[11px] px-2 py-0.5 rounded-md capitalize">{s.replace(/_/g, ' ')}</span>
              ))}
            </div>
          </div>

          {/* Services */}
          {services.length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wide mb-1">Services</div>
              <div className="space-y-1">
                {services.map((s) => (
                  <div key={s.id} className="flex justify-between items-center px-2 py-1.5 bg-stone-50 rounded-md">
                    <span className="text-xs">{formatServiceType(s.type)}</span>
                    <span className="text-xs font-bold text-emerald-600">${s.price}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Photos */}
          {photos.length > 0 && (
            <div className="mb-3">
              <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wide mb-1">Photos</div>
              <div className="grid grid-cols-3 gap-1">
                {photos.slice(0, 3).map((p) => (
                  <div key={p.id} className="aspect-square rounded-md overflow-hidden bg-stone-100">
                    <img src={p.photo_url} alt="" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* View Public Profile link */}
      <Link
        to={`/sitter/${user.id}`}
        className="mt-3 flex items-center justify-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-emerald-600 transition-colors"
      >
        <Eye className="w-3.5 h-3.5" />
        View full public profile
      </Link>
    </div>
  );
}
