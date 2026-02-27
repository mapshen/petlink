import React, { useState, useEffect } from 'react';
import { useAuth, getAuthHeaders } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Pet } from '../types';
import { PawPrint, Plus, Pencil, Trash2, X, Save } from 'lucide-react';

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

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    fetchPets();
  }, [user]);

  const fetchPets = async () => {
    try {
      const res = await fetch('/api/pets', { headers: getAuthHeaders(token) });
      const data = await res.json();
      setPets(data.pets);
    } catch (err) {
      // silently handle
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...form,
      age: form.age ? Number(form.age) : null,
      weight: form.weight ? Number(form.weight) : null,
    };

    const url = editingId ? `/api/pets/${editingId}` : '/api/pets';
    const method = editingId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: getAuthHeaders(token),
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      fetchPets();
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
    const res = await fetch(`/api/pets/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(token),
    });
    if (res.ok) fetchPets();
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
          <input placeholder="Photo URL" value={form.photo_url} onChange={e => setForm({...form, photo_url: e.target.value})}
            className="w-full p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500" />

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
