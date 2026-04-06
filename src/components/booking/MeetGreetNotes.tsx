import React, { useState } from 'react';
import { FileText } from 'lucide-react';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { API_BASE } from '../../config';

interface MeetGreetNotesProps {
  readonly bookingId: number;
  readonly existingNotes?: string | null;
  readonly isSitter: boolean;
  readonly onSaved?: (notes: string) => void;
}

export default function MeetGreetNotes({ bookingId, existingNotes, isSitter, onSaved }: MeetGreetNotesProps) {
  const { token } = useAuth();
  const [notes, setNotes] = useState(existingNotes || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isSitter && !existingNotes) return null;

  // Owner view: just display notes
  if (!isSitter && existingNotes) {
    return (
      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm">
        <div className="flex items-center gap-2 text-emerald-700 font-medium mb-1">
          <FileText className="w-4 h-4" />
          Meet & Greet Notes
        </div>
        <p className="text-stone-600">{existingNotes}</p>
      </div>
    );
  }

  // Sitter view: edit form
  const handleSave = async () => {
    if (!notes.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/bookings/${bookingId}/meet-greet-notes`, {
        method: 'PUT',
        headers: { ...getAuthHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notes.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save notes');
      }
      setSaved(true);
      onSaved?.(notes.trim());
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save notes');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-sm space-y-2">
      <div className="flex items-center gap-2 text-stone-700 font-medium">
        <FileText className="w-4 h-4" />
        Meet & Greet Notes
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Add notes about the meet & greet (e.g., pet behavior, compatibility)..."
        className="w-full p-2 border border-stone-200 rounded-lg text-sm resize-none focus:ring-2 focus:ring-emerald-500 focus:outline-none"
        rows={3}
        maxLength={2000}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          disabled={saving || !notes.trim()}
          className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Notes'}
        </button>
        {saved && <span className="text-xs text-emerald-600 font-medium">Saved!</span>}
      </div>
    </div>
  );
}
