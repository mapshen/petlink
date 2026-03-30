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
  email_enabled: boolean;
}

const ITEMS: { key: keyof NotificationPrefs; label: string; description: string }[] = [
  { key: 'new_booking', label: 'New bookings', description: 'Get notified about new booking requests' },
  { key: 'booking_status', label: 'Booking updates', description: 'Status changes and care task reminders' },
  { key: 'new_message', label: 'Messages', description: 'Get notified about new messages' },
  { key: 'walk_updates', label: 'Walk updates', description: 'GPS tracking and walk completion alerts' },
  { key: 'email_enabled', label: 'Email notifications', description: 'Receive email in addition to in-app notifications' },
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
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {ITEMS.map(({ key, label, description }) => (
        <div key={key} className="flex justify-between items-center">
          <div>
            <div className="text-sm font-semibold">{label}</div>
            <div className="text-xs text-stone-500">{description}</div>
          </div>
          <button
            onClick={() => toggle(key)}
            disabled={saving}
            className={`w-11 h-6 rounded-full transition-colors relative ${prefs[key] ? 'bg-emerald-500' : 'bg-stone-300'}`}
            role="switch"
            aria-checked={prefs[key]}
            aria-label={label}
          >
            <div className={`w-5 h-5 bg-white rounded-full shadow-sm absolute top-0.5 transition-transform ${prefs[key] ? 'translate-x-5' : 'translate-x-0.5'}`} />
          </button>
        </div>
      ))}
    </div>
  );
}
