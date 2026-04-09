import { useState, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { Star, Shield, Calendar } from 'lucide-react';
import { isPast, parseISO, differenceInYears } from 'date-fns';
import { useProfileData, type OwnerProfileData, type OwnerReview, type PetProfileData, type PetVaccination } from '../../hooks/useProfileData';
import { useEditableProfile } from '../../hooks/useEditableProfile';
import ProfileViewHeader from './ProfileViewHeader';
import EditableSection from '../sitter-profile/EditableSection';
import UniversalPostsGrid from '../posts/UniversalPostsGrid';
import type { ProfileType, Pet } from '../../types';

const ProfileTab = lazy(() => import('../../pages/profile/ProfileTab'));

interface ProfileViewProps {
  profileType: ProfileType;
  slug: string;
}

const SPECIES_EMOJI: Record<string, string> = {
  dog: '🐕',
  cat: '🐱',
  bird: '🦜',
  reptile: '🐍',
  small_animal: '🐹',
};

function PetCardContent({ pet }: { pet: Pet }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-14 h-14 rounded-xl bg-amber-50 flex items-center justify-center text-xl flex-shrink-0 overflow-hidden">
        {pet.photo_url ? (
          <img src={pet.photo_url} alt={pet.name} className="w-full h-full object-cover" />
        ) : (
          SPECIES_EMOJI[pet.species] || '🐾'
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-semibold text-stone-800 text-sm">{pet.name}</span>
        </div>
        <div className="text-xs text-stone-500">
          {pet.breed && `${pet.breed} · `}{pet.age ? `${pet.age} yrs` : ''}{pet.gender ? ` · ${pet.gender}` : ''}
        </div>
      </div>
    </div>
  );
}

function PetCard({ pet }: { pet: Pet }) {
  const className = "border border-stone-200 rounded-xl p-4 hover:border-emerald-200 hover:shadow-sm transition-all";
  if (pet.slug) {
    return (
      <Link to={`/pet/${pet.slug}`} className={className}>
        <PetCardContent pet={pet} />
      </Link>
    );
  }
  return (
    <div className={className}>
      <PetCardContent pet={pet} />
    </div>
  );
}

function TrustStats({ owner }: { owner: OwnerProfileData['owner'] }) {
  return (
    <div className="flex gap-4 pt-3 border-t border-stone-100 mt-3">
      <div className="text-center">
        <div className="text-sm font-semibold text-stone-800">{owner.completed_bookings ?? 0}</div>
        <div className="text-xs text-stone-500">Bookings</div>
      </div>
      {owner.avg_rating != null && (
        <div className="text-center">
          <div className="text-sm font-semibold text-stone-800">{owner.avg_rating}</div>
          <div className="text-xs text-stone-500">{owner.review_count} reviews</div>
        </div>
      )}
      {owner.cancellation_rate != null && owner.cancellation_rate > 0 && (
        <div className="text-center">
          <div className="text-sm font-semibold text-amber-600">{owner.cancellation_rate}%</div>
          <div className="text-xs text-stone-500">Cancel rate</div>
        </div>
      )}
      <div className="text-center">
        <div className="text-sm font-semibold text-stone-800">
          {(() => {
            const memberYears = differenceInYears(new Date(), new Date(owner.created_at));
            return memberYears === 0 ? 'New' : `${memberYears} yrs`;
          })()}
        </div>
        <div className="text-xs text-stone-500">Member</div>
      </div>
    </div>
  );
}

function OwnerReviewsList({ reviews }: { reviews: OwnerReview[] }) {
  if (reviews.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-stone-400 text-sm">No reviews yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {reviews.map(review => (
        <div key={review.id} className="flex gap-3 pb-4 border-b border-stone-100 last:border-0 last:pb-0">
          <div className="w-9 h-9 rounded-full bg-stone-100 flex items-center justify-center text-sm flex-shrink-0 overflow-hidden">
            {review.reviewer_avatar ? (
              <img src={review.reviewer_avatar} alt="" className="w-full h-full object-cover" />
            ) : (
              (review.reviewer_name || '?')[0].toUpperCase()
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-sm font-medium text-stone-800">{review.reviewer_name}</span>
              <div className="flex gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className={`w-3 h-3 ${i < review.rating ? 'fill-amber-400 text-amber-400' : 'text-stone-200'}`} />
                ))}
              </div>
              <span className="text-xs text-stone-400">
                {new Date(review.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
            </div>
            {review.comment && <p className="text-sm text-stone-600">{review.comment}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

type OwnerTab = 'posts' | 'reviews';

function OwnerProfile({ data }: { data: OwnerProfileData }) {
  const [activeTab, setActiveTab] = useState<OwnerTab>('posts');
  const { editingSection, viewAsVisitor, startEditing, stopEditing } = useEditableProfile();

  return (
    <>
      <EditableSection
        sectionId="header"
        isOwner={data.isOwner}
        isEditing={editingSection === 'header'}
        viewAsVisitor={viewAsVisitor}
        onEdit={startEditing}
        onClose={stopEditing}
        editContent={
          <Suspense fallback={<div className="h-32 flex items-center justify-center"><div className="animate-spin w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full" /></div>}>
            <ProfileTab />
          </Suspense>
        }
      >
        <ProfileViewHeader
          name={data.owner.name}
          avatarUrl={data.owner.avatar_url}
          profileType="owner"
          isOwner={data.isOwner}
          subtitle={`Member since ${new Date(data.owner.created_at).getFullYear()}`}
        >
          {data.owner.bio && (
            <p className="text-sm text-stone-600 mt-2 leading-relaxed">{data.owner.bio}</p>
          )}
          <TrustStats owner={data.owner} />
        </ProfileViewHeader>
      </EditableSection>

      {data.pets.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 mb-4">
          <h3 className="text-sm font-semibold text-stone-500 uppercase tracking-wider mb-4">
            Pets ({data.pets.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.pets.map(pet => (
              <PetCard key={pet.id} pet={pet} />
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 mb-4">
        <div className="flex border-b border-stone-100 px-6">
          <button
            onClick={() => setActiveTab('posts')}
            className={`px-4 py-3 text-sm transition-colors ${activeTab === 'posts' ? 'border-b-2 border-emerald-500 text-emerald-600 font-semibold' : 'text-stone-500 hover:text-stone-700'}`}
          >
            Posts
          </button>
          <button
            onClick={() => setActiveTab('reviews')}
            className={`px-4 py-3 text-sm transition-colors ${activeTab === 'reviews' ? 'border-b-2 border-emerald-500 text-emerald-600 font-semibold' : 'text-stone-500 hover:text-stone-700'}`}
          >
            Reviews ({data.reviews?.length || 0})
          </button>
        </div>
        <div className="p-6">
          {activeTab === 'posts' && (
            <UniversalPostsGrid destinationType="profile" destinationId={data.owner.id} />
          )}
          {activeTab === 'reviews' && (
            <OwnerReviewsList reviews={data.reviews || []} />
          )}
        </div>
      </div>
    </>
  );
}

const CARE_CATEGORY_EMOJI: Record<string, string> = {
  feeding: '🍽️', medication: '💊', exercise: '🏃', grooming: '✂️',
  behavioral: '🧠', litter_box: '🪣', cage_cleaning: '🧹',
  habitat_maintenance: '🏠', other: '📋',
};

function VaccinationsList({ vaccinations }: { vaccinations: PetVaccination[] }) {
  if (vaccinations.length === 0) {
    return <p className="text-sm text-stone-400 text-center py-4">No vaccination records</p>;
  }
  return (
    <div className="space-y-2">
      {vaccinations.map(v => {
        const isExpired = v.expires_at && isPast(parseISO(v.expires_at));
        return (
          <div key={v.id} className="flex items-center justify-between p-3 bg-stone-50 rounded-xl">
            <div className="flex items-center gap-2">
              <Shield className={`w-4 h-4 ${isExpired ? 'text-amber-500' : 'text-emerald-500'}`} />
              <span className="text-sm font-medium text-stone-800">{v.vaccine_name}</span>
            </div>
            <div className="text-xs text-stone-500 flex items-center gap-3">
              {v.administered_date && (
                <span>Given: {new Date(v.administered_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              )}
              {v.expires_at && (
                <span className={isExpired ? 'text-amber-600 font-medium' : ''}>
                  {isExpired ? 'Expired' : 'Expires'}: {new Date(v.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CareInstructions({ instructions }: { instructions: Array<{ category: string; instructions: string; schedule?: string }> }) {
  if (!instructions || instructions.length === 0) {
    return <p className="text-sm text-stone-400 text-center py-4">No care instructions</p>;
  }
  return (
    <div className="space-y-3">
      {instructions.map((item, idx) => (
        <div key={idx} className="p-3 bg-stone-50 rounded-xl">
          <div className="flex items-center gap-2 mb-1">
            <span>{CARE_CATEGORY_EMOJI[item.category] || '📋'}</span>
            <span className="text-sm font-medium text-stone-800 capitalize">{item.category.replace(/_/g, ' ')}</span>
            {item.schedule && (
              <span className="text-xs text-stone-400 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> {item.schedule}
              </span>
            )}
          </div>
          <p className="text-sm text-stone-600 ml-6">{item.instructions}</p>
        </div>
      ))}
    </div>
  );
}

type PetTab = 'posts' | 'care' | 'vaccinations';

function PetProfile({ data }: { data: PetProfileData }) {
  const pet = data.pet;
  const [activeTab, setActiveTab] = useState<PetTab>('posts');

  const tabItems: Array<{ id: PetTab; label: string; count?: number }> = [
    { id: 'posts', label: 'Posts' },
    ...(data.canViewPrivate ? [
      { id: 'care' as PetTab, label: 'Care Info', count: pet.care_instructions?.length },
      { id: 'vaccinations' as PetTab, label: 'Vaccinations', count: data.vaccinations?.length },
    ] : []),
  ];

  return (
    <>
      <ProfileViewHeader
        name={pet.name}
        avatarUrl={pet.photo_url}
        profileType="pet"
        isOwner={data.isOwner}
        subtitle={[pet.species, pet.breed, pet.age ? `${pet.age} yrs` : null, pet.gender].filter(Boolean).join(' · ')}
        badges={
          <>
            {pet.spayed_neutered && (
              <span className="bg-emerald-50 text-emerald-700 text-xs px-2 py-0.5 rounded-full border border-emerald-200">Fixed</span>
            )}
          </>
        }
        stats={
          data.owner ? (
            <div className="text-sm text-stone-500">
              Owned by{' '}
              <Link to={`/owner/${data.owner.slug}`} className="text-emerald-600 font-medium hover:underline">
                {data.owner.name}
              </Link>
            </div>
          ) : undefined
        }
      />

      {pet.temperament && pet.temperament.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 mb-4">
          <h3 className="text-sm font-semibold text-stone-500 uppercase tracking-wider mb-3">Temperament</h3>
          <div className="flex flex-wrap gap-2">
            {pet.temperament.map(tag => (
              <span key={tag} className="px-3 py-1 bg-stone-50 text-stone-700 text-sm rounded-full">
                {tag.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </span>
            ))}
          </div>
        </div>
      )}

      {pet.special_needs && (
        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 mb-4">
          <h3 className="text-sm font-semibold text-stone-500 uppercase tracking-wider mb-3">Special Needs</h3>
          <p className="text-sm text-stone-700">{pet.special_needs}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 mb-4">
        <div className="flex border-b border-stone-100 px-6">
          {tabItems.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm transition-colors ${activeTab === tab.id ? 'border-b-2 border-emerald-500 text-emerald-600 font-semibold' : 'text-stone-500 hover:text-stone-700'}`}
            >
              {tab.label}{tab.count != null ? ` (${tab.count})` : ''}
            </button>
          ))}
        </div>
        <div className="p-6">
          {activeTab === 'posts' && (
            <UniversalPostsGrid destinationType="pet" destinationId={pet.id} />
          )}
          {activeTab === 'care' && data.canViewPrivate && (
            <CareInstructions instructions={pet.care_instructions || []} />
          )}
          {activeTab === 'vaccinations' && data.canViewPrivate && (
            <VaccinationsList vaccinations={data.vaccinations || []} />
          )}
        </div>
      </div>
    </>
  );
}

export default function ProfileView({ profileType, slug }: ProfileViewProps) {
  const { data, loading, error } = useProfileData(profileType, slug);

  if (loading) {
    return (
      <div className="max-w-[960px] mx-auto py-8 px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-12 flex items-center justify-center">
          <div className="animate-spin w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-[960px] mx-auto py-8 px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-12 text-center">
          <p className="text-stone-500">{error === 'Not found' ? 'Profile not found' : 'Something went wrong'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[960px] mx-auto py-8 px-4">
      {profileType === 'owner' && <OwnerProfile data={data as OwnerProfileData} />}
      {profileType === 'pet' && <PetProfile data={data as PetProfileData} />}
    </div>
  );
}
