import React from 'react';
import { Pet } from '../types';
import { Check } from 'lucide-react';

interface PetSelectorProps {
  pets: Pet[];
  selectedPetIds: number[];
  onSelectionChange: (petIds: number[]) => void;
  maxPets?: number;
}

export default function PetSelector({ pets, selectedPetIds, onSelectionChange, maxPets = 10 }: PetSelectorProps) {
  const togglePet = (petId: number) => {
    const isSelected = selectedPetIds.includes(petId);
    if (isSelected) {
      onSelectionChange(selectedPetIds.filter((id) => id !== petId));
    } else if (selectedPetIds.length < maxPets) {
      onSelectionChange([...selectedPetIds, petId]);
    }
  };

  if (pets.length === 0) {
    return <p className="text-sm text-stone-400 italic">No pets added yet. Add pets in your profile first.</p>;
  }

  return (
    <div className="space-y-2">
      {selectedPetIds.length >= maxPets && (
        <p className="text-xs text-amber-600">Maximum {maxPets} pets per booking reached.</p>
      )}
      {pets.map((pet) => {
        const isSelected = selectedPetIds.includes(pet.id);
        const isDisabled = !isSelected && selectedPetIds.length >= maxPets;
        return (
          <button
            key={pet.id}
            type="button"
            role="checkbox"
            aria-checked={isSelected}
            aria-disabled={isDisabled || undefined}
            aria-label={`Select ${pet.name}`}
            onClick={() => togglePet(pet.id)}
            className={`w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all ${
              isSelected
                ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500'
                : isDisabled
                  ? 'border-stone-100 opacity-50 cursor-not-allowed'
                  : 'border-stone-200 hover:border-emerald-200'
            }`}
          >
            <img
              src={pet.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(pet.name)}&background=d1fae5&color=059669`}
              alt={pet.name}
              className="w-8 h-8 rounded-full object-cover border border-stone-200"
            />
            <div className="flex-grow min-w-0">
              <span className="font-medium text-stone-900 text-sm">{pet.name}</span>
              {pet.breed && <span className="text-xs text-stone-400 ml-1.5">{pet.breed}</span>}
            </div>
            {isSelected && (
              <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                <Check className="w-3 h-3 text-white" />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
