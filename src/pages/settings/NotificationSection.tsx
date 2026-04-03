import { useState, useEffect } from 'react';
import { getAuthHeaders } from '../../context/AuthContext';
import { Loader2 } from 'lucide-react';
import { API_BASE } from '../../config';
import { Alert, AlertDescription } from '../../components/ui/alert';

interface NotificationPrefs {
  new_booking: boolean;
  booking_status: boolean;
  new_message: boolean;
  walk_updates: boolean;
  booking_reminders: boolean;
  booking_reminders_email: boolean;
  email_enabled: boolean;
}

interface PrefItem {
  key: keyof NotificationPrefs;
  label: string;
  description: string;
  emailKey?: keyof NotificationPrefs;
}

const ITEMS: PrefItem[] = [
  { key: 'new_booking', label: 'New bookings', description: 'When someone books your services' },
  { key: 'booking_status', label: 'Booking updates', description: 'Status changes and care task reminders' },
  { key: 'booking_reminders', label: 'Booking reminders', description: 'Day-before booking reminders', emailKey: 'booking_reminders_email' },
  { key: 'new_message', label: 'Messages', description: 'When you receive a new message' },
  { key: 'walk_updates', label: 'Walk updates', description: 'GPS tracking and walk completion alerts' },
];

export default function NotificationSection({ token }: { readonly token: string | null }) {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_BASE}/notification-preferences`, { headers: getAuthHeaders(token) })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.preferences) setPrefs(data.preferences);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [token]);

  const toggle = async (key: keyof NotificationPrefs) => {
    if (!prefs) return;
    const previous = prefs;
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/notification-preferences`, {
        method: 'PUT',
        headers: getAuthHeaders(token),
        body: JSON.stringify(updated),
      });
      if (!res.ok) throw new Error('Failed to save');
    } catch {
      setPrefs(previous);
      setError('Failed to save notification preferences');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-stone-400" /></div>;
  if (!prefs) return <p className="text-sm text-stone-500">Unable to load preferences.</p>;

  return (
    <div className="space-y-1">
      {error && (
        <Alert variant="destructive" className="mb-3">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {ITEMS.map(({ key, label, description, emailKey }) => (
        <div key={key} className="flex justify-between items-center py-3 border-b border-stone-100 last:border-0">
          <div>
            <div className="text-sm font-semibold">{label}</div>
            <div className="text-xs text-stone-500">{description}</div>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-stone-600">
              <input
                type="checkbox"
                checked={prefs[key]}
                onChange={() => toggle(key)}
                disabled={saving}
                className="rounded text-emerald-600"
              />
              App
            </label>
            {emailKey && (
              <label className="flex items-center gap-1.5 text-xs text-stone-600">
                <input
                  type="checkbox"
                  checked={prefs[emailKey]}
                  onChange={() => toggle(emailKey)}
                  disabled={saving}
                  className="rounded text-emerald-600"
                />
                Email
              </label>
            )}
          </div>
        </div>
      ))}

      {/* Global email toggle */}
      <div className="flex justify-between items-center pt-4 mt-2 border-t border-stone-200">
        <div>
          <div className="text-sm font-semibold">Email notifications</div>
          <div className="text-xs text-stone-500">Master switch for all email notifications</div>
        </div>
        <button
          onClick={() => toggle('email_enabled')}
          disabled={saving}
          className={`w-11 h-6 rounded-full transition-colors relative ${prefs.email_enabled ? 'bg-emerald-500' : 'bg-stone-300'}`}
          role="switch"
          aria-checked={prefs.email_enabled}
          aria-label="Email notifications"
        >
          <div className={`w-5 h-5 bg-white rounded-full shadow-sm absolute top-0.5 transition-transform ${prefs.email_enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>
    </div>
  );
}
