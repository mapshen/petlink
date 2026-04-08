import { useState, useEffect } from 'react';
import { getAuthHeaders, useAuth } from '../../context/AuthContext';
import { Save } from 'lucide-react';
import { API_BASE } from '../../config';
import type { User } from '../../types';

interface Props {
  readonly token: string | null;
  readonly user: User | null;
}

export default function AccountSection({ token, user }: Props) {
  const { updateUser } = useAuth();
  const [phone, setPhone] = useState('');
  const [sharePhone, setSharePhone] = useState(true);
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [emergencyRelationship, setEmergencyRelationship] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!user) return;
    setPhone(user.phone || '');
    setSharePhone(user.share_phone_for_bookings ?? true);
    setEmergencyName(user.emergency_contact_name || '');
    setEmergencyPhone(user.emergency_contact_phone || '');
    setEmergencyRelationship(user.emergency_contact_relationship || '');
  }, [user]);

  if (!user) return null;

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch(`${API_BASE}/users/me`, {
        method: 'PUT',
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          name: user.name,
          phone: phone || null,
          share_phone_for_bookings: sharePhone,
          emergency_contact_name: emergencyName || null,
          emergency_contact_phone: emergencyPhone || null,
          emergency_contact_relationship: emergencyRelationship || null,
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      const data = await res.json();
      updateUser(data.user);
      setMessage('Settings saved');
      setTimeout(() => setMessage(''), 3000);
    } catch {
      setMessage('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {/* Email */}
      <div className="py-4 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-stone-700">Email</div>
          <div className="text-sm text-stone-500 mt-0.5">{user.email}</div>
        </div>
      </div>

      {/* Phone */}
      <div className="border-t py-4">
        <div className="text-sm font-medium text-stone-700 mb-2">Phone</div>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(555) 123-4567"
          className="max-w-xs w-full p-2.5 border border-stone-200 rounded-lg text-sm"
        />
        <div className="flex items-center gap-2.5 mt-3">
          <button
            type="button"
            role="switch"
            aria-checked={sharePhone}
            onClick={() => setSharePhone(prev => !prev)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${sharePhone ? 'bg-emerald-500' : 'bg-stone-300'}`}
          >
            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${sharePhone ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
          <span className="text-sm text-stone-600">Share during active bookings</span>
        </div>
      </div>

      {/* Emergency Contact */}
      <div className="border-t py-4">
        <div className="text-sm font-medium text-stone-700 mb-2">Emergency Contact</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Name</label>
            <input
              type="text"
              value={emergencyName}
              onChange={(e) => setEmergencyName(e.target.value)}
              placeholder="Jane Doe"
              className="w-full p-2.5 border border-stone-200 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Phone</label>
            <input
              type="tel"
              value={emergencyPhone}
              onChange={(e) => setEmergencyPhone(e.target.value)}
              placeholder="(555) 123-4567"
              className="w-full p-2.5 border border-stone-200 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Relationship</label>
            <input
              type="text"
              value={emergencyRelationship}
              onChange={(e) => setEmergencyRelationship(e.target.value)}
              placeholder="Spouse, Parent, Friend..."
              className="w-full p-2.5 border border-stone-200 rounded-lg text-sm"
            />
          </div>
        </div>
        <p className="text-xs text-stone-400 mt-2">Only shared upon request during an emergency.</p>
      </div>

      {/* Save */}
      <div className="border-t pt-4 flex items-center justify-end gap-3">
        {message && (
          <span className={`text-xs ${message.includes('saved') ? 'text-emerald-600' : 'text-red-600'}`}>
            {message}
          </span>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
