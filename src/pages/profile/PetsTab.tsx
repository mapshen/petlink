import React, { useState, useEffect } from 'react';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { Pet } from '../../types';
import { PawPrint, Plus } from 'lucide-react';
import { EmptyState } from '../../components/ui/EmptyState';
import { API_BASE } from '../../config';
import { Alert, AlertDescription } from '../../components/ui/alert';
import PetCard from './PetCard';
import PetDetail from './PetDetail';
import PetDetailsForm from './PetDetailsForm';

export default function PetsTab() {
  const { user, token } = useAuth();
  const [pets, setPets] = useState<Pet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPetId, setSelectedPetId] = useState<number | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  useEffect(() => {
    if (!user) return;
    fetchPets();
  }, [user, token]);

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

  const handleDelete = async (id: number) => {
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/pets/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(token),
      });
      if (!res.ok) throw new Error('Failed to delete pet');
      setSelectedPetId(null);
      fetchPets();
    } catch {
      setError('Failed to delete pet. Please try again.');
    }
  };

  const handleSave = () => {
    setShowAddForm(false);
    fetchPets();
  };

  const selectedPet = pets.find(p => p.id === selectedPetId) ?? null;

  if (loading) {
    return (
      <div className="flex justify-center py-12" role="status" aria-live="polite">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600" />
        <span className="sr-only">Loading...</span>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div />
        {!showAddForm && (
          <button
            onClick={() => { setShowAddForm(true); setSelectedPetId(null); }}
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

      {showAddForm && (
        <PetDetailsForm
          token={token}
          onSave={handleSave}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {pets.length === 0 && !showAddForm ? (
        <EmptyState
          icon={PawPrint}
          title="No pets yet"
          description="Add your first pet to get started with bookings."
          actionLabel="Add Pet"
          onAction={() => setShowAddForm(true)}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            {pets.map(pet => (
              <PetCard
                key={pet.id}
                pet={pet}
                isSelected={selectedPetId === pet.id}
                onClick={() => setSelectedPetId(selectedPetId === pet.id ? null : pet.id)}
              />
            ))}
          </div>

          {selectedPet && (
            <PetDetail
              pet={selectedPet}
              token={token}
              onClose={() => setSelectedPetId(null)}
              onUpdate={fetchPets}
              onDelete={handleDelete}
            />
          )}
        </>
      )}
    </div>
  );
}
