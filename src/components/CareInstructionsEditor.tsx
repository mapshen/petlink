import React, { useState, useEffect } from 'react';
import { CareInstruction } from '../types';
import { Plus, Trash2, Save, ClipboardList, AlertCircle } from 'lucide-react';
import { API_BASE } from '../config';
import { getAuthHeaders } from '../context/AuthContext';
import { Button } from './ui/button';

const CATEGORIES = [
  { value: 'feeding', label: 'Feeding', icon: '🍽️' },
  { value: 'medication', label: 'Medication', icon: '💊' },
  { value: 'exercise', label: 'Exercise', icon: '🏃' },
  { value: 'grooming', label: 'Grooming', icon: '✂️' },
  { value: 'behavioral', label: 'Behavioral', icon: '🧠' },
  { value: 'other', label: 'Other', icon: '📝' },
] as const;

interface Props {
  petId: number;
  petName: string;
  token: string | null;
}

export default function CareInstructionsEditor({ petId, petName, token }: Props) {
  const [instructions, setInstructions] = useState<CareInstruction[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetchInstructions();
  }, [petId]);

  const fetchInstructions = async () => {
    try {
      const res = await fetch(`${API_BASE}/pets/${petId}/care-instructions`, { headers: getAuthHeaders(token) });
      if (res.ok) {
        const data = await res.json();
        setInstructions(data.care_instructions || []);
      }
    } catch {
      // Non-critical
    } finally {
      setLoaded(true);
    }
  };

  const addInstruction = () => {
    setInstructions(prev => [
      ...prev,
      { id: crypto.randomUUID(), category: 'feeding', description: '', time: '', notes: '' },
    ]);
    setSaved(false);
  };

  const updateInstruction = (id: string, field: keyof CareInstruction, value: string) => {
    setInstructions(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
    setSaved(false);
  };

  const removeInstruction = (id: string) => {
    setInstructions(prev => prev.filter(i => i.id !== id));
    setSaved(false);
  };

  const handleSave = async () => {
    const valid = instructions.filter(i => i.description.trim());
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/pets/${petId}/care-instructions`, {
        method: 'PUT',
        headers: getAuthHeaders(token),
        body: JSON.stringify({ care_instructions: valid }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save');
      }
      setInstructions(valid);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save care instructions');
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-emerald-600" />
          Care Instructions for {petName}
        </h3>
        <button type="button" onClick={addInstruction}
          className="text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1">
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>

      {instructions.length === 0 && (
        <p className="text-xs text-stone-400 italic">No care instructions yet. Add feeding schedules, medications, and behavioral notes so sitters know how to care for {petName}.</p>
      )}

      {instructions.map((instr) => (
        <div key={instr.id} className="bg-stone-50 rounded-lg border border-stone-200 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <select value={instr.category}
              onChange={e => updateInstruction(instr.id, 'category', e.target.value)}
              className="p-1.5 text-xs border border-stone-200 rounded-lg bg-white">
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
            </select>
            <input
              value={instr.time || ''}
              onChange={e => updateInstruction(instr.id, 'time', e.target.value)}
              placeholder="Time (e.g., 8:00 AM)"
              className="p-1.5 text-xs border border-stone-200 rounded-lg flex-shrink-0 w-32"
            />
            <button type="button" onClick={() => removeInstruction(instr.id)}
              className="p-1 text-stone-300 hover:text-red-500 flex-shrink-0">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <input
            value={instr.description}
            onChange={e => updateInstruction(instr.id, 'description', e.target.value)}
            placeholder="What needs to be done? *"
            className="w-full p-2 text-sm border border-stone-200 rounded-lg"
          />
          <input
            value={instr.notes || ''}
            onChange={e => updateInstruction(instr.id, 'notes', e.target.value)}
            placeholder="Additional notes (optional)"
            className="w-full p-2 text-xs border border-stone-200 rounded-lg text-stone-500"
          />
        </div>
      ))}

      {error && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" /> {error}
        </p>
      )}

      {instructions.length > 0 && (
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving...' : 'Save Instructions'}
          </Button>
          {saved && <span className="text-xs text-emerald-600">Saved!</span>}
        </div>
      )}
    </div>
  );
}
