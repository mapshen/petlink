import { useState, useEffect } from 'react';
import { getAuthHeaders } from '../../context/AuthContext';
import { Save } from 'lucide-react';
import { API_BASE } from '../../config';
import type { User } from '../../types';

interface Props {
  readonly token: string | null;
  readonly user: User;
}

export default function EmergencyContactForm({ token, user }: Props) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relationship, setRelationship] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setName(user.emergency_contact_name || '');
    setPhone(user.emergency_contact_phone || '');
    setRelationship(user.emergency_contact_relationship || '');
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch(`${API_BASE}/users/me`, {
        method: 'PUT',
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          name: user.name,
          emergency_contact_name: name || null,
          emergency_contact_phone: phone || null,
          emergency_contact_relationship: relationship || null,
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      setMessage('Emergency contact saved');
    } catch {
      setMessage('Failed to save emergency contact');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {!name && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
          Adding an emergency contact helps keep pets safe. This information is shared with the other party when a booking is confirmed.
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-stone-500 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Doe"
            className="w-full p-2.5 border border-stone-200 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-stone-500 mb-1">Phone</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(555) 123-4567"
            className="w-full p-2.5 border border-stone-200 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-stone-500 mb-1">Relationship</label>
          <input
            type="text"
            value={relationship}
            onChange={(e) => setRelationship(e.target.value)}
            placeholder="Spouse, Parent, Friend..."
            className="w-full p-2.5 border border-stone-200 rounded-lg text-sm"
          />
        </div>
      </div>

      {message && (
        <div className={`text-xs text-center p-2 rounded-lg ${
          message.includes('saved') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
        }`}>
          {message}
        </div>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center gap-2"
      >
        <Save className="w-3.5 h-3.5" />
        {saving ? 'Saving...' : 'Save Contact'}
      </button>
    </div>
  );
}
