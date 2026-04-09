import React, { useState, useEffect } from 'react';
import { PetVaccination } from '../../types';
import { Syringe, Trash2 } from 'lucide-react';
import { API_BASE } from '../../config';
import { getAuthHeaders } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';

interface PetVaccinationsProps {
  petId: number;
  token: string | null;
}

export default function PetVaccinations({ petId, token }: PetVaccinationsProps) {
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
    <div>
      <div className="flex items-center justify-between mb-3">
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
