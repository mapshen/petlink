import React, { useState, useEffect, useRef } from 'react';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { Pet, PetVaccination } from '../../types';
import { PawPrint, Plus, Pencil, Trash2, X, Save, AlertCircle, Camera, Loader2, Syringe, ChevronDown, ChevronUp } from 'lucide-react';
import CareInstructionsEditor from '../../components/profile/CareInstructionsEditor';
import { API_BASE } from '../../config';
import { useImageUpload } from '../../hooks/useImageUpload';
import { Button } from '../../components/ui/button';
import { Alert, AlertDescription } from '../../components/ui/alert';
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

const SPECIES_OPTIONS = [
  { value: 'dog', label: 'Dog' },
  { value: 'cat', label: 'Cat' },
  { value: 'bird', label: 'Bird' },
  { value: 'reptile', label: 'Reptile' },
  { value: 'small_animal', label: 'Small Animal' },
] as const;

const GENDER_OPTIONS = [
  { value: '', label: 'Not specified' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
] as const;

const ENERGY_LEVELS = [
  { value: '', label: 'Not specified' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
] as const;

const TEMPERAMENT_TAGS = [
  'friendly', 'shy', 'anxious', 'reactive', 'good_with_kids',
  'good_with_dogs', 'good_with_cats', 'playful', 'calm', 'independent',
] as const;

interface PetFormData {
  name: string;
  species: string;
  breed: string;
  age: string;
  weight: string;
  gender: string;
  spayed_neutered: boolean | null;
  energy_level: string;
  house_trained: boolean | null;
  temperament: string[];
  special_needs: string;
  microchip_number: string;
  vet_name: string;
  vet_phone: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  medical_history: string;
  photo_url: string;
}

const emptyForm: PetFormData = {
  name: '', species: 'dog', breed: '', age: '', weight: '',
  gender: '', spayed_neutered: null, energy_level: '', house_trained: null,
  temperament: [], special_needs: '', microchip_number: '',
  vet_name: '', vet_phone: '', emergency_contact_name: '', emergency_contact_phone: '',
  medical_history: '', photo_url: '',
};

function formatTag(tag: string): string {
  return tag.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export default function PetsTab() {
  const { user, token } = useAuth();
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<PetFormData>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogPetId, setDeleteDialogPetId] = useState<number | null>(null);
  const [expandedPetId, setExpandedPetId] = useState<number | null>(null);
  const petFileInputRef = useRef<HTMLInputElement>(null);
  const { uploading, progress, error: uploadError, upload, clearError } = useImageUpload(token);

  const handlePetPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    clearError();
    const url = await upload(file, 'pets');
    if (url) setForm((prev) => ({ ...prev, photo_url: url }));
    if (petFileInputRef.current) petFileInputRef.current.value = '';
  };

  useEffect(() => {
    if (!user) return;
    fetchPets();
  }, [user]);

  const fetchPets = async () => {
    try {
      const res = await fetch(`${API_BASE}/pets`, { headers: getAuthHeaders(token) });
      if (!res.ok) throw new Error('Failed to load pets');
      const data = await res.json();
      setPets(data.pets);
    } catch {
      setError('Failed to load pets. Please try again.');
    } finally {
      setLoading(false);
    }
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

    const url = editingId ? `${API_BASE}/pets/${editingId}` : `${API_BASE}/pets`;
    const method = editingId ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(token),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to ${editingId ? 'update' : 'add'} pet`);
      }

      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      fetchPets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save pet. Please try again.');
    }
  };

  const handleEdit = (pet: Pet) => {
    setForm({
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
    });
    setEditingId(pet.id);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/pets/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(token),
      });
      if (!res.ok) throw new Error('Failed to delete pet');
      fetchPets();
    } catch {
      setError('Failed to delete pet. Please try again.');
    }
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const toggleTemperament = (tag: string) => {
    setForm(prev => ({
      ...prev,
      temperament: prev.temperament.includes(tag)
        ? prev.temperament.filter(t => t !== tag)
        : [...prev.temperament, tag],
    }));
  };

  if (loading) return <div className="flex justify-center py-12" role="status" aria-live="polite"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div><span className="sr-only">Loading...</span></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-stone-900">My Pets</h2>
        {!showForm && (
          <button
            onClick={() => { setForm(emptyForm); setEditingId(null); setShowForm(true); }}
            className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add Pet
          </button>
        )}
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} aria-label="Dismiss error" className="text-xs font-medium hover:underline">Dismiss</button>
          </AlertDescription>
        </Alert>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-stone-50 rounded-xl border border-stone-200 p-6 mb-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-stone-900">{editingId ? 'Edit Pet' : 'Add New Pet'}</h3>
            <button type="button" onClick={cancelForm} aria-label="Close form" className="text-stone-400 hover:text-stone-600"><X className="w-5 h-5" /></button>
          </div>

          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input required placeholder="Name *" value={form.name} onChange={e => setForm({...form, name: e.target.value})}
              className="p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500" />
            <select value={form.species} onChange={e => setForm({...form, species: e.target.value})}
              className="p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500">
              {SPECIES_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <input placeholder="Breed" value={form.breed} onChange={e => setForm({...form, breed: e.target.value})}
              className="p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500" />
            <select value={form.gender} onChange={e => setForm({...form, gender: e.target.value})}
              className="p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500">
              {GENDER_OPTIONS.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
            <input type="number" placeholder="Age (years)" value={form.age} onChange={e => setForm({...form, age: e.target.value})}
              className="p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500" />
            <input type="number" step="0.1" placeholder="Weight (lbs)" value={form.weight} onChange={e => setForm({...form, weight: e.target.value})}
              className="p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500" />
          </div>

          {/* Status Toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <label className="flex items-center gap-2 p-3 border border-stone-200 rounded-lg cursor-pointer hover:bg-white">
              <input type="checkbox" checked={form.spayed_neutered === true}
                onChange={e => setForm({...form, spayed_neutered: e.target.checked})}
                className="rounded text-emerald-600 focus:ring-emerald-500" />
              <span className="text-sm text-stone-700">Spayed/Neutered</span>
            </label>
            <label className="flex items-center gap-2 p-3 border border-stone-200 rounded-lg cursor-pointer hover:bg-white">
              <input type="checkbox" checked={form.house_trained === true}
                onChange={e => setForm({...form, house_trained: e.target.checked})}
                className="rounded text-emerald-600 focus:ring-emerald-500" />
              <span className="text-sm text-stone-700">House Trained</span>
            </label>
            <select value={form.energy_level} onChange={e => setForm({...form, energy_level: e.target.value})}
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
            <input placeholder="Microchip Number" value={form.microchip_number} onChange={e => setForm({...form, microchip_number: e.target.value})}
              className="p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500" />
          </div>
          <textarea rows={2} placeholder="Special needs (medications, dietary restrictions, mobility issues)" value={form.special_needs}
            onChange={e => setForm({...form, special_needs: e.target.value})}
            className="w-full p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500" />
          <textarea rows={2} placeholder="Medical history / notes" value={form.medical_history}
            onChange={e => setForm({...form, medical_history: e.target.value})}
            className="w-full p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500" />

          {/* Vet & Emergency Contact */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input placeholder="Vet Name" value={form.vet_name} onChange={e => setForm({...form, vet_name: e.target.value})}
              className="p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500" />
            <input placeholder="Vet Phone" value={form.vet_phone} onChange={e => setForm({...form, vet_phone: e.target.value})}
              className="p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500" />
            <input placeholder="Emergency Contact Name" value={form.emergency_contact_name} onChange={e => setForm({...form, emergency_contact_name: e.target.value})}
              className="p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500" />
            <input placeholder="Emergency Contact Phone" value={form.emergency_contact_phone} onChange={e => setForm({...form, emergency_contact_phone: e.target.value})}
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
            <Save className="w-4 h-4" /> {editingId ? 'Update' : 'Add'} Pet
          </button>
        </form>
      )}

      {pets.length === 0 && !showForm ? (
        <div className="bg-stone-50 rounded-xl border border-stone-200 p-12 text-center">
          <PawPrint className="w-12 h-12 mx-auto mb-4 text-stone-300" />
          <p className="text-stone-500">No pets yet. Add your first pet!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {pets.map(pet => (
            <div key={pet.id} className="bg-white rounded-xl shadow-sm border border-stone-100 overflow-hidden">
              {pet.photo_url && (
                <img src={pet.photo_url} alt={pet.name} className="w-full h-48 object-cover" />
              )}
              <div className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-bold text-stone-900">{pet.name}</h3>
                    <span className="text-xs bg-stone-100 text-stone-500 px-2 py-0.5 rounded-full capitalize">{pet.species || 'dog'}</span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleEdit(pet)} className="p-1.5 text-stone-400 hover:text-emerald-600 transition-colors">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => setDeleteDialogPetId(pet.id)} className="p-1.5 text-stone-400 hover:text-red-500 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {pet.breed && <p className="text-sm text-stone-500 mb-2">{pet.breed}</p>}
                <div className="flex gap-4 text-sm text-stone-500 flex-wrap">
                  {pet.age != null && <span>{pet.age} years</span>}
                  {pet.weight != null && <span>{pet.weight} lbs</span>}
                  {pet.gender && <span className="capitalize">{pet.gender}</span>}
                  {pet.spayed_neutered && <span>Spayed/Neutered</span>}
                  {pet.energy_level && <span>Energy: {pet.energy_level}</span>}
                  {pet.house_trained && <span>House trained</span>}
                </div>
                {pet.temperament && pet.temperament.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {pet.temperament.map(tag => (
                      <span key={tag} className="bg-emerald-50 text-emerald-700 text-xs px-2 py-0.5 rounded-full">{formatTag(tag)}</span>
                    ))}
                  </div>
                )}
                {pet.special_needs && (
                  <p className="mt-3 text-sm text-amber-700 bg-amber-50 p-3 rounded-lg">{pet.special_needs}</p>
                )}
                {pet.medical_history && (
                  <p className="mt-3 text-sm text-stone-600 bg-stone-50 p-3 rounded-lg">{pet.medical_history}</p>
                )}

                {/* Expandable details */}
                <button
                  type="button"
                  onClick={() => setExpandedPetId(expandedPetId === pet.id ? null : pet.id)}
                  className="mt-3 text-xs text-stone-400 hover:text-stone-600 flex items-center gap-1"
                >
                  {expandedPetId === pet.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {expandedPetId === pet.id ? 'Less details' : 'More details'}
                  {pet.care_instructions && (pet.care_instructions as unknown[]).length > 0 && (
                    <span className="bg-emerald-100 text-emerald-700 text-xs px-1.5 py-0.5 rounded-full ml-1">
                      {(pet.care_instructions as unknown[]).length} care
                    </span>
                  )}
                </button>

                {expandedPetId === pet.id && (
                  <div className="mt-3 space-y-2 text-sm text-stone-600">
                    {pet.microchip_number && <p><span className="font-medium">Microchip:</span> {pet.microchip_number}</p>}
                    {pet.vet_name && <p><span className="font-medium">Vet:</span> {pet.vet_name} {pet.vet_phone && `(${pet.vet_phone})`}</p>}
                    {pet.emergency_contact_name && <p><span className="font-medium">Emergency:</span> {pet.emergency_contact_name} {pet.emergency_contact_phone && `(${pet.emergency_contact_phone})`}</p>}
                    <VaccinationSection petId={pet.id} token={token} />
                    <div className="mt-3 border-t border-stone-100 pt-3">
                      <CareInstructionsEditor petId={pet.id} petName={pet.name} token={token} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={deleteDialogPetId !== null} onOpenChange={(open) => { if (!open) setDeleteDialogPetId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Pet</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this pet? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => { if (deleteDialogPetId !== null) handleDelete(deleteDialogPetId); }}>
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function VaccinationSection({ petId, token }: { petId: number; token: string | null }) {
  const [vaccinations, setVaccinations] = useState<PetVaccination[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [vaccineName, setVaccineName] = useState('');
  const [administeredDate, setAdministeredDate] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchVaccinations();
  }, [petId]);

  const fetchVaccinations = async () => {
    try {
      const res = await fetch(`${API_BASE}/pets/${petId}/vaccinations`, { headers: getAuthHeaders(token) });
      if (res.ok) {
        const data = await res.json();
        setVaccinations(data.vaccinations);
      }
    } catch {
      // Non-critical
    }
  };

  const handleAdd = async () => {
    if (!vaccineName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_BASE}/pets/${petId}/vaccinations`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          vaccine_name: vaccineName,
          administered_date: administeredDate || null,
          expires_at: expiresAt || null,
        }),
      });
      if (res.ok) {
        setVaccineName('');
        setAdministeredDate('');
        setExpiresAt('');
        setShowAdd(false);
        fetchVaccinations();
      }
    } catch {
      // Silently fail
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (vaccId: number) => {
    try {
      await fetch(`${API_BASE}/pets/${petId}/vaccinations/${vaccId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(token),
      });
      fetchVaccinations();
    } catch {
      // Silently fail
    }
  };

  return (
    <div className="mt-3 border-t border-stone-100 pt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium text-stone-700 flex items-center gap-1.5">
          <Syringe className="w-3.5 h-3.5" /> Vaccinations
        </span>
        <button type="button" onClick={() => setShowAdd(!showAdd)} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">
          {showAdd ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {showAdd && (
        <div className="space-y-2 mb-3">
          <input placeholder="Vaccine name *" value={vaccineName} onChange={e => setVaccineName(e.target.value)}
            className="w-full p-2 text-sm border border-stone-200 rounded-lg" />
          <div className="grid grid-cols-2 gap-2">
            <input type="date" placeholder="Date given" value={administeredDate} onChange={e => setAdministeredDate(e.target.value)}
              className="p-2 text-sm border border-stone-200 rounded-lg" />
            <input type="date" placeholder="Expires" value={expiresAt} onChange={e => setExpiresAt(e.target.value)}
              className="p-2 text-sm border border-stone-200 rounded-lg" />
          </div>
          <Button size="sm" onClick={handleAdd} disabled={saving || !vaccineName.trim()}>
            {saving ? 'Saving...' : 'Add Vaccination'}
          </Button>
        </div>
      )}

      {vaccinations.length === 0 && !showAdd && (
        <p className="text-xs text-stone-400 italic">No vaccination records</p>
      )}

      {vaccinations.map(v => (
        <div key={v.id} className="flex items-center justify-between py-1.5 border-b border-stone-50 last:border-0">
          <div>
            <span className="text-sm font-medium">{v.vaccine_name}</span>
            <span className="text-xs text-stone-400 ml-2">
              {v.administered_date && `Given: ${new Date(v.administered_date).toLocaleDateString()}`}
              {v.expires_at && ` | Expires: ${new Date(v.expires_at).toLocaleDateString()}`}
            </span>
          </div>
          <button onClick={() => handleDelete(v.id)} className="text-stone-300 hover:text-red-500 p-1">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
