import React, { useState } from 'react';
import { Pet } from '../../types';
import { X, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import CareInstructionsEditor from '../../components/profile/CareInstructionsEditor';
import PetDetailsForm from './PetDetailsForm';
import PetVaccinations from './PetVaccinations';
import { formatTag, SPECIES_EMOJI } from './pet-constants';

type SubTab = 'details' | 'vaccinations' | 'care';

interface PetDetailProps {
  pet: Pet;
  token: string | null;
  onClose: () => void;
  onUpdate: () => void;
  onDelete: (petId: number) => void;
}

export default function PetDetail({ pet, token, onClose, onUpdate, onDelete }: PetDetailProps) {
  const [activeTab, setActiveTab] = useState<SubTab>('details');
  const [editing, setEditing] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const tabs: { key: SubTab; label: string }[] = [
    { key: 'details', label: 'Details' },
    { key: 'vaccinations', label: 'Vaccinations' },
    { key: 'care', label: 'Care Instructions' },
  ];

  const careCount = Array.isArray(pet.care_instructions) ? pet.care_instructions.length : 0;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-stone-100 overflow-hidden">
      {/* Header */}
      <div className="bg-emerald-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden="true">
            {SPECIES_EMOJI[pet.species] ?? '🐾'}
          </span>
          <div>
            <h3 className="text-lg font-bold text-stone-900">{pet.name}</h3>
            <div className="flex gap-2 text-xs text-stone-500">
              {pet.breed && <span>{pet.breed}</span>}
              {pet.age != null && <span>{pet.age} years</span>}
              {pet.weight != null && <span>{pet.weight} lbs</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowDeleteDialog(true)} className="p-1.5 text-stone-400 hover:text-red-500 transition-colors" aria-label="Delete pet">
            <Trash2 className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="p-1.5 text-stone-400 hover:text-stone-600 transition-colors" aria-label="Close detail">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="border-b border-stone-100 px-6">
        <div className="flex gap-4">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setEditing(false); }}
              className={`py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-stone-500 hover:text-stone-700'
              }`}
            >
              {tab.label}
              {tab.key === 'care' && careCount > 0 && (
                <span className="bg-emerald-100 text-emerald-700 text-xs px-1.5 py-0.5 rounded-full ml-1.5">
                  {careCount}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="p-6">
        {activeTab === 'details' && !editing && (
          <PetDetailsSummary pet={pet} onEdit={() => setEditing(true)} />
        )}
        {activeTab === 'details' && editing && (
          <PetDetailsForm
            pet={pet}
            token={token}
            onSave={() => { setEditing(false); onUpdate(); }}
            onCancel={() => setEditing(false)}
          />
        )}
        {activeTab === 'vaccinations' && (
          <PetVaccinations petId={pet.id} token={token} />
        )}
        {activeTab === 'care' && (
          <CareInstructionsEditor petId={pet.id} petName={pet.name} token={token} />
        )}
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Pet</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {pet.name}? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => onDelete(pet.id)}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PetDetailsSummary({ pet, onEdit }: { pet: Pet; onEdit: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={onEdit} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">
          Edit Details
        </button>
      </div>

      {pet.photo_url && (
        <img src={pet.photo_url} alt={pet.name} className="w-full h-48 rounded-lg object-cover" />
      )}

      <div className="grid grid-cols-2 gap-3 text-sm">
        <InfoRow label="Species" value={pet.species} />
        {pet.breed && <InfoRow label="Breed" value={pet.breed} />}
        {pet.age != null && <InfoRow label="Age" value={`${pet.age} years`} />}
        {pet.weight != null && <InfoRow label="Weight" value={`${pet.weight} lbs`} />}
        {pet.gender && <InfoRow label="Gender" value={pet.gender} />}
        {pet.energy_level && <InfoRow label="Energy" value={pet.energy_level} />}
        {pet.spayed_neutered && <InfoRow label="Status" value="Spayed/Neutered" />}
        {pet.house_trained && <InfoRow label="House Trained" value="Yes" />}
        {pet.microchip_number && <InfoRow label="Microchip" value={pet.microchip_number} />}
      </div>

      {pet.temperament && pet.temperament.length > 0 && (
        <div>
          <span className="text-xs font-medium text-stone-500 uppercase tracking-wide">Temperament</span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {pet.temperament.map(tag => (
              <span key={tag} className="bg-emerald-50 text-emerald-700 text-xs px-2 py-0.5 rounded-full">{formatTag(tag)}</span>
            ))}
          </div>
        </div>
      )}

      {pet.special_needs && (
        <p className="text-sm text-amber-700 bg-amber-50 p-3 rounded-lg">{pet.special_needs}</p>
      )}
      {pet.medical_history && (
        <p className="text-sm text-stone-600 bg-stone-50 p-3 rounded-lg">{pet.medical_history}</p>
      )}

      {(pet.vet_name || pet.emergency_contact_name) && (
        <div className="border-t border-stone-100 pt-3 space-y-1 text-sm text-stone-600">
          {pet.vet_name && <p><span className="font-medium">Vet:</span> {pet.vet_name} {pet.vet_phone && `(${pet.vet_phone})`}</p>}
          {pet.emergency_contact_name && <p><span className="font-medium">Emergency:</span> {pet.emergency_contact_name} {pet.emergency_contact_phone && `(${pet.emergency_contact_phone})`}</p>}
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs font-medium text-stone-500 uppercase tracking-wide">{label}</span>
      <p className="text-stone-900 capitalize">{value}</p>
    </div>
  );
}
