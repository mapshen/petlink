import { Link } from 'react-router-dom';
import { useProfileData, type OwnerProfileData, type PetProfileData } from '../../hooks/useProfileData';
import ProfileViewHeader from './ProfileViewHeader';
import type { ProfileType, Pet } from '../../types';

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

function PetCard({ pet }: { pet: Pet }) {
  return (
    <Link
      to={`/pet/${pet.slug || pet.id}`}
      className="border border-stone-200 rounded-xl p-4 hover:border-emerald-200 hover:shadow-sm transition-all"
    >
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
    </Link>
  );
}

function OwnerProfile({ data }: { data: OwnerProfileData }) {
  return (
    <>
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
      </ProfileViewHeader>

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
    </>
  );
}

function PetProfile({ data }: { data: PetProfileData }) {
  const pet = data.pet;
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
    </>
  );
}

export default function ProfileView({ profileType, slug }: ProfileViewProps) {
  const { data, loading, error, isOwner: _isOwner } = useProfileData(profileType, slug);

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
