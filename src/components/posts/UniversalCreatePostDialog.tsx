import { useState, useEffect } from 'react';
import { Camera, X } from 'lucide-react';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { useImageUpload } from '../../hooks/useImageUpload';
import { API_BASE } from '../../config';
import type { Pet, PostDestinationType, CommunitySpace } from '../../types';

interface UniversalCreatePostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPostCreated: () => void;
  defaultDestinations?: Array<{ destination_type: PostDestinationType; destination_id: number }>;
}

export default function UniversalCreatePostDialog({
  open,
  onOpenChange,
  onPostCreated,
  defaultDestinations,
}: UniversalCreatePostDialogProps) {
  const { token, user } = useAuth();
  const { upload, uploading, progress } = useImageUpload(token);
  const [content, setContent] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [pets, setPets] = useState<Pet[]>([]);
  const [spaces, setSpaces] = useState<CommunitySpace[]>([]);
  const [selectedPetIds, setSelectedPetIds] = useState<number[]>([]);
  const [selectedDestinations, setSelectedDestinations] = useState<Array<{ destination_type: PostDestinationType; destination_id: number }>>(defaultDestinations || []);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !token) return;
    Promise.allSettled([
      fetch(`${API_BASE}/pets`, { headers: getAuthHeaders(token) }).then(r => r.json()),
      fetch(`${API_BASE}/forum/categories`, { headers: getAuthHeaders(token) }).then(r => r.json()),
    ]).then(([petsResult, spacesResult]) => {
      if (petsResult.status === 'fulfilled') setPets(petsResult.value.pets || []);
      if (spacesResult.status === 'fulfilled') setSpaces(spacesResult.value.categories || []);
    });
  }, [open, token]);

  useEffect(() => {
    if (!open) {
      setContent('');
      setPhotoUrl('');
      setSelectedPetIds([]);
      setSelectedDestinations(defaultDestinations || []);
      setError('');
    }
  }, [open, defaultDestinations]);

  async function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await upload(file, 'posts');
      if (url) setPhotoUrl(url);
    } catch {
      setError('Failed to upload photo');
    }
  }

  function togglePetTag(petId: number) {
    setSelectedPetIds(prev =>
      prev.includes(petId) ? prev.filter(id => id !== petId) : [...prev, petId]
    );
  }

  function toggleDestination(type: PostDestinationType, id: number) {
    setSelectedDestinations(prev => {
      const exists = prev.some(d => d.destination_type === type && d.destination_id === id);
      return exists
        ? prev.filter(d => !(d.destination_type === type && d.destination_id === id))
        : [...prev, { destination_type: type, destination_id: id }];
    });
  }

  async function handleSubmit() {
    if (!content.trim() && !photoUrl) {
      setError('Add some text or a photo');
      return;
    }
    if (!token) return;

    setSubmitting(true);
    setError('');
    try {
      // Build destinations: include pet destinations for tagged pets
      const destinations = [...selectedDestinations];
      for (const petId of selectedPetIds) {
        if (!destinations.some(d => d.destination_type === 'pet' && d.destination_id === petId)) {
          destinations.push({ destination_type: 'pet', destination_id: petId });
        }
      }

      const res = await fetch(`${API_BASE}/posts`, {
        method: 'POST',
        headers: { ...getAuthHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: content.trim() || undefined,
          photo_url: photoUrl || undefined,
          post_type: 'update',
          destinations: destinations.length > 0 ? destinations : undefined,
          pet_tag_ids: selectedPetIds.length > 0 ? selectedPetIds : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to create post');
        return;
      }

      onPostCreated();
      onOpenChange(false);
    } catch {
      setError('Failed to create post');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const destCount = selectedDestinations.length + selectedPetIds.filter(id => !selectedDestinations.some(d => d.destination_type === 'pet' && d.destination_id === id)).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => onOpenChange(false)}>
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full mx-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-4 border-b border-stone-100 flex items-center justify-between">
          <h2 className="font-semibold text-stone-800">New Post</h2>
          <button onClick={() => onOpenChange(false)} className="text-stone-400 hover:text-stone-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Author */}
        <div className="p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-sm font-medium overflow-hidden">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              (user?.name || '?')[0].toUpperCase()
            )}
          </div>
          <div className="text-sm font-semibold text-stone-800">{user?.name}</div>
        </div>

        {/* Content */}
        <div className="px-4 pb-3">
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={3}
            className="w-full text-sm text-stone-700 resize-none outline-none border border-stone-200 rounded-lg p-3 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
            placeholder="What's happening?"
            maxLength={2000}
          />
          <div className="text-right text-xs text-stone-400">{content.length}/2000</div>
        </div>

        {/* Photo preview */}
        {photoUrl && (
          <div className="px-4 pb-3 relative">
            <img src={photoUrl} alt="" className="rounded-xl max-h-60 w-full object-cover" />
            <button onClick={() => setPhotoUrl('')} className="absolute top-1 right-5 w-7 h-7 bg-black/50 rounded-full flex items-center justify-center text-white hover:bg-black/70">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {uploading && (
          <div className="px-4 pb-3">
            <div className="w-full bg-stone-100 rounded-full h-1.5">
              <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}

        {/* Pet tags */}
        {pets.length > 0 && (
          <div className="px-4 pb-3">
            <div className="text-xs font-medium text-stone-500 mb-2">Tag pets</div>
            <div className="flex gap-2 flex-wrap">
              {pets.map(pet => {
                const selected = selectedPetIds.includes(pet.id);
                return (
                  <button
                    key={pet.id}
                    onClick={() => togglePetTag(pet.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-all ${
                      selected
                        ? 'bg-emerald-50 border-2 border-emerald-300 text-emerald-700 font-medium'
                        : 'bg-stone-50 border border-stone-200 text-stone-600 hover:border-emerald-300'
                    }`}
                  >
                    {pet.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Destinations */}
        {(selectedPetIds.length > 0 || spaces.length > 0) && (
          <div className="px-4 pb-4">
            <div className="text-xs font-medium text-stone-500 mb-2">Also share to</div>
            <div className="space-y-2">
              {pets.filter(p => selectedPetIds.includes(p.id)).map(pet => {
                const isSelected = selectedDestinations.some(d => d.destination_type === 'pet' && d.destination_id === pet.id);
                return (
                  <label key={`pet-${pet.id}`} className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all ${isSelected ? 'bg-emerald-50 border border-emerald-200' : 'border border-stone-100 hover:border-emerald-200'}`}>
                    <input type="checkbox" checked={isSelected} onChange={() => toggleDestination('pet', pet.id)} className="accent-emerald-600 w-4 h-4" />
                    <div className="text-sm text-stone-700">{pet.name}'s profile</div>
                  </label>
                );
              })}
              {spaces.map(space => {
                const isSelected = selectedDestinations.some(d => d.destination_type === 'space' && d.destination_id === space.id);
                return (
                  <label key={`space-${space.id}`} className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all ${isSelected ? 'bg-emerald-50 border border-emerald-200' : 'border border-stone-100 hover:border-emerald-200'}`}>
                    <input type="checkbox" checked={isSelected} onChange={() => toggleDestination('space', space.id)} className="accent-emerald-600 w-4 h-4" />
                    <div className="flex items-center gap-1.5 text-sm text-stone-700">
                      {space.emoji && <span>{space.emoji}</span>} {space.name}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="px-4 pb-3 text-sm text-red-600">{error}</div>
        )}

        {/* Actions */}
        <div className="p-4 border-t border-stone-100 flex items-center justify-between">
          <div className="flex gap-2">
            <label className="p-2 text-stone-400 hover:text-stone-600 rounded-lg hover:bg-stone-100 cursor-pointer">
              <Camera className="w-5 h-5" />
              <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={handlePhotoSelect} className="hidden" />
            </label>
          </div>
          <button
            onClick={handleSubmit}
            disabled={submitting || uploading || (!content.trim() && !photoUrl)}
            className="px-5 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {destCount > 1 ? `Post to ${destCount} places` : 'Post'}
          </button>
        </div>
      </div>
    </div>
  );
}
