import { useState } from 'react';
import { MapPin, ShieldCheck, Crown, Heart, MessageSquare, Clock, Users, CheckCircle, Calendar, Eye, EyeOff } from 'lucide-react';
import { formatResponseTime } from '../../shared/response-time';
import type { User, SitterSpeciesProfile, ProfileMember } from '../../types';
import { getDisplayName, buildCombinedName } from '../../shared/display-name';
import { buildSpeciesBadges } from './SpeciesDetails';
import { FoundingSitterBadge } from '../badges/FoundingSitterBadge';
import LifestyleBadges from '../badges/LifestyleBadges';

interface Props {
  readonly sitter: User;
  readonly postCount: number;
  readonly cityName: string | null;
  readonly currentUser: User | null;
  readonly isFavorited: boolean;
  readonly onToggleFavorite: (sitterId: number) => void;
  readonly onBookClick: () => void;
  readonly onMessageClick: () => void;
  readonly speciesProfiles?: SitterSpeciesProfile[];
  readonly profileMembers?: ProfileMember[];
  readonly isOwner?: boolean;
  readonly viewAsVisitor?: boolean;
  readonly onToggleViewMode?: () => void;
}

const BIO_TRUNCATE_LIMIT = 150;

export function formatSkill(skill: string): string {
  return skill.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function buildHeaderTags(sitter: User): string[] {
  const tags: string[] = [];
  if (sitter.accepted_species) {
    tags.push(...sitter.accepted_species.map((s) => s.replace(/_/g, ' ')));
  }
  // Only show sizes for dog sitters
  if (sitter.accepted_species?.includes('dog') && sitter.accepted_pet_sizes && sitter.accepted_pet_sizes.length > 0) {
    tags.push(...sitter.accepted_pet_sizes);
  }
  if (sitter.home_type) tags.push(sitter.home_type);
  if (sitter.has_fenced_yard) tags.push('fenced yard');
  else if (sitter.has_yard) tags.push('yard');
  if (sitter.has_own_pets) tags.push('has own pets');
  if (sitter.skills) {
    tags.push(...sitter.skills.map(formatSkill));
  }
  if (sitter.camera_preference === 'requires') tags.push('requires cameras');
  else if (sitter.camera_preference === 'prefers') tags.push('prefers cameras');
  return tags;
}

export default function SitterProfileHeader({
  sitter,
  postCount,
  cityName,
  currentUser,
  isFavorited,
  onToggleFavorite,
  onBookClick,
  onMessageClick,
  speciesProfiles = [],
  profileMembers = [],
  isOwner = false,
  viewAsVisitor = false,
  onToggleViewMode,
}: Props) {
  const [bioExpanded, setBioExpanded] = useState(false);
  const showFavorite = currentUser != null && currentUser.id !== sitter.id;
  const isPro = sitter.subscription_tier === 'pro';
  const isPremium = sitter.subscription_tier === 'premium';
  const tags = buildHeaderTags(sitter);
  const speciesBadges = buildSpeciesBadges(speciesProfiles);

  const bio = sitter.bio || '';
  const shouldTruncate = bio.length > BIO_TRUNCATE_LIMIT;
  const displayBio = shouldTruncate && !bioExpanded ? bio.slice(0, BIO_TRUNCATE_LIMIT) + '...' : bio;

  return (
    <div className="bg-white border-b border-stone-200">
      <div className="max-w-[960px] mx-auto px-6 py-8 flex gap-8 items-start">
        {/* Avatar(s) */}
        <div className="flex-shrink-0 flex items-end">
          <div className="w-[130px] h-[130px] rounded-full border-4 border-emerald-50 overflow-hidden bg-stone-300">
            <img
              src={sitter.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(sitter.name)}&size=130`}
              alt={sitter.name}
              className="w-full h-full object-cover"
            />
          </div>
          {profileMembers.length > 0 && (
            <div className="-ml-8 w-[90px] h-[90px] rounded-full border-4 border-white overflow-hidden bg-stone-300">
              <img
                src={profileMembers[0].avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profileMembers[0].name)}&size=90`}
                alt={profileMembers[0].name}
                className="w-full h-full object-cover"
              />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          {/* Name + badges */}
          <div className="flex items-center gap-3 mb-2.5 flex-wrap">
            <h1 className="text-2xl font-extrabold text-stone-900">{getDisplayName(buildCombinedName(sitter.name, profileMembers))}</h1>
            {/* All approved sitters show as verified — approval requires admin review. Future: check verifications table for ID/background check status */}
            <span className="bg-emerald-100 text-emerald-800 text-xs font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" />
              Verified
            </span>
            {isPremium ? (
              <span className="bg-violet-100 text-violet-800 text-xs font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <Crown className="w-3 h-3" />
                Premium
              </span>
            ) : isPro ? (
              <span className="bg-amber-100 text-amber-800 text-xs font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1">
                <Crown className="w-3 h-3" />
                Pro
              </span>
            ) : null}
            {sitter.founding_sitter && <FoundingSitterBadge size="md" />}
          </div>

          {/* Location */}
          <div className="flex items-center text-stone-500 text-sm mb-3">
            <MapPin className="w-3.5 h-3.5 mr-1" />
            <span>{cityName || 'Location not shared'}</span>
          </div>

          {/* Species badges */}
          {speciesBadges.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {speciesBadges.map((badge) => (
                <span
                  key={badge.species}
                  className="bg-emerald-50 text-emerald-800 text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5"
                >
                  <span>{badge.emoji}</span>
                  {badge.label}
                  {badge.years != null && <span className="text-emerald-600">· {badge.years} yrs</span>}
                </span>
              ))}
            </div>
          )}

          {/* Stats row */}
          <div className="flex gap-8 mb-3">
            <div>
              <span className="font-extrabold text-lg">{postCount}</span>
              <span className="text-sm text-stone-500 ml-1">posts</span>
            </div>
            <div>
              <span className="font-extrabold text-lg">{sitter.avg_rating ?? '—'}</span>
              <span className="text-sm text-stone-500 ml-1">rating</span>
            </div>
            <div>
              <span className="font-extrabold text-lg">{sitter.review_count ?? 0}</span>
              <span className="text-sm text-stone-500 ml-1">reviews</span>
            </div>
          </div>

          {/* Trust signals */}
          <div className="flex flex-wrap gap-x-5 gap-y-1 mb-3 text-sm text-stone-500">
            {(() => {
              const rt = formatResponseTime(sitter.avg_response_hours);
              return rt ? (
                <span className={`flex items-center gap-1.5 ${rt.color === 'emerald' ? 'text-emerald-600' : 'text-amber-600'}`}>
                  <Clock className="w-3.5 h-3.5" />
                  {rt.label}
                </span>
              ) : null;
            })()}
            {sitter.repeat_client_count != null && sitter.repeat_client_count > 0 && (
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" />
                {sitter.repeat_client_count} repeat clients
              </span>
            )}
            {sitter.completion_rate != null && (
              <span className="flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5" />
                {Math.round(sitter.completion_rate * 100)}% completed
              </span>
            )}
            {sitter.member_since && (
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                Member since {new Date(sitter.member_since).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </span>
            )}
          </div>

          {/* Bio */}
          {bio && (
            <p className="text-sm text-stone-600 leading-relaxed mb-2.5">
              {displayBio}
              {shouldTruncate && (
                <button
                  onClick={() => setBioExpanded(!bioExpanded)}
                  className="text-stone-400 font-medium ml-1 hover:text-stone-600"
                >
                  {bioExpanded ? 'less' : 'more'}
                </button>
              )}
            </p>
          )}

          {/* Lifestyle Badges */}
          {sitter.active_badges && sitter.active_badges.length > 0 && (
            <div className="mb-3">
              <LifestyleBadges badges={sitter.active_badges} size="md" maxVisible={6} />
            </div>
          )}

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3.5">
              {tags.map((tag, idx) => (
                <span key={`${tag}-${idx}`} className="bg-stone-100 text-stone-700 text-xs font-medium px-2.5 py-1 rounded-lg capitalize">
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            {isOwner && onToggleViewMode && (
              <button
                onClick={onToggleViewMode}
                className="bg-stone-100 text-stone-700 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-stone-200 transition-colors flex items-center gap-1.5"
              >
                {viewAsVisitor ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                {viewAsVisitor ? 'Back to editing' : 'View as visitor'}
              </button>
            )}
            {(!isOwner || viewAsVisitor) && (
              <button
                onClick={isOwner ? undefined : onBookClick}
                disabled={isOwner}
                className="bg-emerald-600 text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Book Now
              </button>
            )}
            {currentUser && (
              <button
                onClick={onMessageClick}
                className="bg-white text-stone-900 border border-stone-200 px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-stone-50 transition-colors flex items-center gap-1.5"
              >
                <MessageSquare className="w-4 h-4" />
                Message
              </button>
            )}
            {showFavorite && (
              <button
                onClick={() => onToggleFavorite(sitter.id)}
                aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                className={`border px-2.5 py-2.5 rounded-xl transition-colors ${
                  isFavorited
                    ? 'bg-red-50 border-red-200 text-red-500'
                    : 'bg-white border-stone-200 text-stone-400 hover:text-red-400 hover:border-red-200'
                }`}
              >
                <Heart className={`w-4.5 h-4.5 ${isFavorited ? 'fill-current' : ''}`} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
