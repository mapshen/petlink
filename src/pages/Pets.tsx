import React, { useState, useEffect, useRef } from 'react';
import { useAuth, getAuthHeaders } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Pet } from '../types';
import { PawPrint, Plus, Pencil, Trash2, X, Save, AlertCircle, Camera, Loader2 } from 'lucide-react';
import { API_BASE } from '../config';
import { useImageUpload } from '../hooks/useImageUpload';

interface PetFormData {
  name: string;
  breed: string;
  age: string;
  weight: string;
  medical_history: string;
  photo_url: string;
}

const emptyForm: PetFormData = { name: '', breed: '', age: '', weight: '', medical_history: '', photo_url: '' };

export default function Pets() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<PetFormData>(emptyForm);
  const [error, setError] = useState<string | null>(null);
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
    if (!user) { navigate('/login'); return; }
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
      breed: pet.breed || '',
      age: pet.age?.toString() || '',
      weight: pet.weight?.toString() || '',
      medical_history: pet.medical_history || '',
      photo_url: pet.photo_url || '',
    });
    setEditingId(pet.id);
    setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to remove this pet?')) return;
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

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div></div>;

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-stone-900">My Pets</h1>
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
        <div role="alert" className="mb-6 flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-grow">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-xs font-medium">Dismiss</button>
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 mb-8 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-stone-900">{editingId ? 'Edit Pet' : 'Add New Pet'}</h2>
            <button type="button" onClick={cancelForm} className="text-stone-400 hover:text-stone-600"><X className="w-5 h-5" /></button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input required placeholder="Name *" value={form.name} onChange={e => setForm({...form, name: e.target.value})}
              className="p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500" />
            <input placeholder="Breed" value={form.breed} onChange={e => setForm({...form, breed: e.target.value})}
              className="p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500" />
            <input type="number" placeholder="Age (years)" value={form.age} onChange={e => setForm({...form, age: e.target.value})}
              className="p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500" />
            <input type="number" step="0.1" placeholder="Weight (lbs)" value={form.weight} onChange={e => setForm({...form, weight: e.target.value})}
              className="p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500" />
          </div>
          <textarea rows={3} placeholder="Medical history / vaccination records" value={form.medical_history}
            onChange={e => setForm({...form, medical_history: e.target.value})}
            className="w-full p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500" />
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

          <button type="submit" className="bg-emerald-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-emerald-700 transition-colors flex items-center gap-2">
            <Save className="w-4 h-4" /> {editingId ? 'Update' : 'Add'} Pet
          </button>
        </form>
      )}

      {pets.length === 0 && !showForm ? (
        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-12 text-center">
          <PawPrint className="w-12 h-12 mx-auto mb-4 text-stone-300" />
          <p className="text-stone-500">No pets yet. Add your first pet!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {pets.map(pet => (
            <div key={pet.id} className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
              {pet.photo_url && (
                <img src={pet.photo_url} alt={pet.name} className="w-full h-48 object-cover" />
              )}
              <div className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xl font-bold text-stone-900">{pet.name}</h3>
                  <div className="flex gap-2">
                    <button onClick={() => handleEdit(pet)} className="p-1.5 text-stone-400 hover:text-emerald-600 transition-colors">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(pet.id)} className="p-1.5 text-stone-400 hover:text-red-500 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {pet.breed && <p className="text-sm text-stone-500 mb-2">{pet.breed}</p>}
                <div className="flex gap-4 text-sm text-stone-500">
                  {pet.age != null && <span>{pet.age} years</span>}
                  {pet.weight != null && <span>{pet.weight} lbs</span>}
                </div>
                {pet.medical_history && (
                  <p className="mt-3 text-sm text-stone-600 bg-stone-50 p-3 rounded-lg">{pet.medical_history}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
