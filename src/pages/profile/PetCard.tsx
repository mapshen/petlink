import React from 'react';
import { Pet } from '../../types';
import { PawPrint } from 'lucide-react';
import { formatTag } from './pet-constants';

interface PetCardProps {
  pet: Pet;
  isSelected: boolean;
  onClick: () => void;
}

const SPECIES_EMOJI: Record<string, string> = {
  dog: '🐕', cat: '🐈', bird: '🐦', reptile: '🦎', small_animal: '🐹',
};

export default function PetCard({ pet, isSelected, onClick }: PetCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left bg-white rounded-xl shadow-sm border overflow-hidden transition-all hover:shadow-md ${
        isSelected ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-stone-100'
      }`}
    >
      {pet.photo_url && (
        <img src={pet.photo_url} alt={pet.name} className="w-full h-36 object-cover" />
      )}
      <div className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg" aria-hidden="true">
            {SPECIES_EMOJI[pet.species] ?? '🐾'}
          </span>
          <h3 className="text-base font-bold text-stone-900 truncate">{pet.name}</h3>
        </div>

        <div className="flex gap-2 text-xs text-stone-500 flex-wrap mt-1">
          {pet.breed && <span>{pet.breed}</span>}
          {pet.age != null && <span>{pet.age}y</span>}
          {pet.gender && <span className="capitalize">{pet.gender}</span>}
        </div>

        {/* Status badges */}
        <div className="flex flex-wrap gap-1.5 mt-2">
          {pet.spayed_neutered && (
            <span className="bg-emerald-50 text-emerald-700 text-xs px-2 py-0.5 rounded-full">Fixed</span>
          )}
          {pet.microchip_number && (
            <span className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full">Chipped</span>
          )}
          {pet.special_needs && (
            <span className="bg-amber-50 text-amber-700 text-xs px-2 py-0.5 rounded-full">Special Needs</span>
          )}
          {pet.temperament && pet.temperament.length > 0 && pet.temperament.slice(0, 2).map(tag => (
            <span key={tag} className="bg-stone-100 text-stone-600 text-xs px-2 py-0.5 rounded-full">
              {formatTag(tag)}
            </span>
          ))}
        </div>
      </div>
    </button>
  );
}
