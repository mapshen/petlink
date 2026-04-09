import React, { useState, useRef } from 'react';
import { Pet } from '../../types';
import { X, Save, AlertCircle, Camera, Loader2, PawPrint } from 'lucide-react';
import { API_BASE } from '../../config';
import { getAuthHeaders } from '../../context/AuthContext';
import { useImageUpload } from '../../hooks/useImageUpload';
import {
  SPECIES_OPTIONS, GENDER_OPTIONS, ENERGY_LEVELS, TEMPERAMENT_TAGS,
  formatTag, emptyForm, PetFormData,
} from './pet-constants';

interface PetDetailsFormProps {
  pet?: Pet;
  token: string | null;
  onSave: () => void;
  onCancel: () => void;
}

function petToFormData(pet: Pet): PetFormData {
  return {
    name: pet.name,
    species: pet.species || 'dog',
    breed: pet.breed || '',
    age: pet.age?.toString() || '',
    weight: pet.weight?.toString() || '',
    gender: pet.gender || '',
    spayed_neutered: pet.spayed_neutered ?? null,
    energy_level: pet.energy_level || '',
    house_trained: pet.house_trained ?? null,
    temperament: pet.temperament || [],
    special_needs: pet.special_needs || '',
    microchip_number: pet.microchip_number || '',
    vet_name: pet.vet_name || '',
    vet_phone: pet.vet_phone || '',
    emergency_contact_name: pet.emergency_contact_name || '',
    emergency_contact_phone: pet.emergency_contact_phone || '',
    medical_history: pet.medical_history || '',
    photo_url: pet.photo_url || '',
  };
}

export default function PetDetailsForm({ pet, token, onSave, onCancel }: PetDetailsFormProps) {
  const [form, setForm] = useState<PetFormData>(pet ? petToFormData(pet) : emptyForm);
  const [error, setError] = useState<string | null>(null);
  const petFileInputRef = useRef<HTMLInputElement>(null);
  const { uploading, progress, error: uploadError, upload, clearError } = useImageUpload(token);
  const isEditing = !!pet;

  const handlePetPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    clearError();
    const url = await upload(file, 'pets');
    if (url) setForm(prev => ({ ...prev, photo_url: url }));
    if (petFileInputRef.current) petFileInputRef.current.value = '';
  };

  const toggleTemperament = (tag: string) => {
    setForm(prev => ({
      ...prev,
      temperament: prev.temperament.includes(tag)
        ? prev.temperament.filter(t => t !== tag)
        : [...prev.temperament, tag],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const payload = {
      ...form,
      age: form.age ? Number(form.age) : null,
      weight: form.weight ? Number(form.weight) : null,
      gender: form.gender || null,
      energy_level: form.energy_level || null,
    };

    const url = isEditing ? `${API_BASE}/pets/${pet.id}` : `${API_BASE}/pets`;
    const method = isEditing ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(token),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to ${isEditing ? 'update' : 'add'} pet`);
      }

      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save pet. Please try again.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-stone-50 rounded-xl border border-stone-200 p-6 mb-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-stone-900">{isEditing ? 'Edit Pet' : 'Add New Pet'}</h3>
        <button type="button" onClick={onCancel} aria-label="Close form" className="text-stone-400 hover:text-stone-600"><X className="w-5 h-5" /></button>
      </div>

      {error && (
        <p className="text-sm text-red-600 flex items-center gap-1">
          <AlertCircle className="w-4 h-4" /> {error}
        </p>
      )}

      {/* Basic Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <input required placeholder="Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
          className="p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500" />
        <select value={form.species} onChange={e => setForm({ ...form, species: e.target.value })}
          className="p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500">
          {SPECIES_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <input placeholder="Breed" value={form.breed} onChange={e => setForm({ ...form, breed: e.target.value })}
          className="p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500" />
        <select value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}
          className="p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500">
          {GENDER_OPTIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select>
        <input type="number" placeholder="Age (years)" value={form.age} onChange={e => setForm({ ...form, age: e.target.value })}
          className="p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500" />
        <input type="number" step="0.1" placeholder="Weight (lbs)" value={form.weight} onChange={e => setForm({ ...form, weight: e.target.value })}
          className="p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500" />
      </div>

      {/* Status Toggles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <label className="flex items-center gap-2 p-3 border border-stone-200 rounded-lg cursor-pointer hover:bg-white">
          <input type="checkbox" checked={form.spayed_neutered === true}
            onChange={e => setForm({ ...form, spayed_neutered: e.target.checked })}
            className="rounded text-emerald-600 focus:ring-emerald-500" />
          <span className="text-sm text-stone-700">Spayed/Neutered</span>
        </label>
        <label className="flex items-center gap-2 p-3 border border-stone-200 rounded-lg cursor-pointer hover:bg-white">
          <input type="checkbox" checked={form.house_trained === true}
            onChange={e => setForm({ ...form, house_trained: e.target.checked })}
            className="rounded text-emerald-600 focus:ring-emerald-500" />
          <span className="text-sm text-stone-700">House Trained</span>
        </label>
        <select value={form.energy_level} onChange={e => setForm({ ...form, energy_level: e.target.value })}
          className="p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500 text-sm">
          {ENERGY_LEVELS.map(l => <option key={l.value} value={l.value}>{l.value ? `Energy: ${l.label}` : 'Energy Level'}</option>)}
        </select>
      </div>

      {/* Temperament Tags */}
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-2">Temperament</label>
        <div className="flex flex-wrap gap-2">
          {TEMPERAMENT_TAGS.map(tag => (
            <button key={tag} type="button" onClick={() => toggleTemperament(tag)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                form.temperament.includes(tag) ? 'bg-emerald-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}>
              {formatTag(tag)}
            </button>
          ))}
        </div>
      </div>

      {/* Health & Safety */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <input placeholder="Microchip Number" value={form.microchip_number} onChange={e => setForm({ ...form, microchip_number: e.target.value })}
          className="p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500" />
      </div>
      <textarea rows={2} placeholder="Special needs (medications, dietary restrictions, mobility issues)" value={form.special_needs}
        onChange={e => setForm({ ...form, special_needs: e.target.value })}
        className="w-full p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500" />
      <textarea rows={2} placeholder="Medical history / notes" value={form.medical_history}
        onChange={e => setForm({ ...form, medical_history: e.target.value })}
        className="w-full p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500" />

      {/* Vet & Emergency Contact */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <input placeholder="Vet Name" value={form.vet_name} onChange={e => setForm({ ...form, vet_name: e.target.value })}
          className="p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500" />
        <input placeholder="Vet Phone" value={form.vet_phone} onChange={e => setForm({ ...form, vet_phone: e.target.value })}
          className="p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500" />
        <input placeholder="Emergency Contact Name" value={form.emergency_contact_name} onChange={e => setForm({ ...form, emergency_contact_name: e.target.value })}
          className="p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500" />
        <input placeholder="Emergency Contact Phone" value={form.emergency_contact_phone} onChange={e => setForm({ ...form, emergency_contact_phone: e.target.value })}
          className="p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500" />
      </div>

      {/* Pet Photo Upload */}
      <div className="flex items-center gap-4">
        <div className="relative group flex-shrink-0">
          {form.photo_url ? (
            <img src={form.photo_url} alt="Pet" className="w-20 h-20 rounded-xl object-cover border-2 border-stone-100" />
          ) : (
            <div className="w-20 h-20 rounded-xl bg-stone-100 flex items-center justify-center border-2 border-stone-200">
              <PawPrint className="w-6 h-6 text-stone-300" />
            </div>
          )}
          <button
            type="button"
            aria-label={uploading ? 'Uploading photo' : 'Change pet photo'}
            onClick={() => petFileInputRef.current?.click()}
            disabled={uploading}
            className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            {uploading ? (
              <Loader2 className="w-5 h-5 text-white animate-spin" />
            ) : (
              <Camera className="w-5 h-5 text-white" />
            )}
          </button>
          <input
            ref={petFileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handlePetPhotoUpload}
            className="hidden"
            aria-label="Upload pet photo"
          />
        </div>
        <div className="flex-grow">
          <p className="text-sm font-medium text-stone-700">Pet Photo</p>
          <p className="text-xs text-stone-400 mt-0.5">JPEG, PNG, WebP or GIF. Max 5MB.</p>
          {uploading && (
            <div className="mt-2 w-full bg-stone-100 rounded-full h-1.5">
              <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          )}
          {uploadError && (
            <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" /> {uploadError}
            </p>
          )}
        </div>
      </div>

      <button type="submit" disabled={uploading} className="bg-emerald-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center gap-2">
        <Save className="w-4 h-4" /> {isEditing ? 'Update' : 'Add'} Pet
      </button>
    </form>
  );
}
