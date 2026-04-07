import { useState, useEffect } from 'react';
import { getAuthHeaders, useAuth } from '../../context/AuthContext';
import { Save } from 'lucide-react';
import { API_BASE } from '../../config';
import type { User } from '../../types';

interface Props {
  readonly token: string | null;
  readonly user: User;
}

export default function PhonePrivacyForm({ token, user }: Props) {
  const { updateUser } = useAuth();
  const [phone, setPhone] = useState('');
  const [sharePhone, setSharePhone] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    setPhone(user.phone || '');
    setSharePhone(user.share_phone_for_bookings ?? true);
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
          phone: phone || null,
          share_phone_for_bookings: sharePhone,
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      const data = await res.json();
      updateUser(data.user);
      setMessage('Phone settings saved');
    } catch {
      setMessage('Failed to save phone settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
        Your phone number is shared with the other party only during active bookings. They see a masked version (***-***-1234) and can call you directly.
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-stone-500 mb-1">Phone Number</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(555) 123-4567"
            className="w-full p-2.5 border border-stone-200 rounded-lg text-sm"
          />
        </div>
        <div className="flex items-center">
          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={sharePhone}
              onChange={(e) => setSharePhone(e.target.checked)}
              className="w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span className="text-sm text-stone-700">Share phone during active bookings</span>
          </label>
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
        <Save className="w-4 h-4" />
        {saving ? 'Saving...' : 'Save'}
      </button>
    </div>
  );
}
