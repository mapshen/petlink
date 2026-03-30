import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { API_BASE } from '../../config';
import { Save, Loader2, Trash2 } from 'lucide-react';
import LinkedAccounts from '../../components/profile/LinkedAccounts';
import SubscriptionPage from '../profile/SubscriptionPage';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../../components/ui/alert-dialog';

interface NotificationPrefs {
  new_booking: boolean;
  booking_status: boolean;
  new_message: boolean;
  walk_updates: boolean;
  email_enabled: boolean;
}

function PasswordSection({ token }: { readonly token: string | null }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch(`${API_BASE}/auth/password`, {
        method: 'PUT',
        headers: getAuthHeaders(token),
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to change password');
      setMessage('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Current Password</label>
        <input
          type="password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="w-full p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">New Password</label>
        <input
          type="password"
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
        />
        <p className="text-xs text-stone-400 mt-1">Minimum 8 characters</p>
      </div>
      {message && (
        <div className={`text-sm p-2 rounded-lg ${message.includes('success') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {message}
        </div>
      )}
      <button
        type="submit"
        disabled={saving}
        className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center gap-2"
      >
        <Save className="w-4 h-4" />
        {saving ? 'Saving...' : 'Change Password'}
      </button>
    </form>
  );
}

function NotificationSection({ token }: { readonly token: string | null }) {
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useState(() => {
    fetch(`${API_BASE}/notification-preferences`, { headers: getAuthHeaders(token) })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.preferences) setPrefs(data.preferences);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  });

  const toggle = async (key: keyof NotificationPrefs) => {
    if (!prefs) return;
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    setSaving(true);
    try {
      await fetch(`${API_BASE}/notification-preferences`, {
        method: 'PUT',
        headers: getAuthHeaders(token),
        body: JSON.stringify(updated),
      });
    } catch {
      setPrefs(prefs);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-stone-400" /></div>;
  if (!prefs) return <p className="text-sm text-stone-500">Unable to load preferences.</p>;

  const items: { key: keyof NotificationPrefs; label: string; description: string }[] = [
    { key: 'new_booking', label: 'New bookings', description: 'Get notified about new booking requests' },
    { key: 'booking_status', label: 'Booking updates', description: 'Status changes and care task reminders' },
    { key: 'new_message', label: 'Messages', description: 'Get notified about new messages' },
    { key: 'walk_updates', label: 'Walk updates', description: 'GPS tracking and walk completion alerts' },
    { key: 'email_enabled', label: 'Email notifications', description: 'Receive email in addition to in-app notifications' },
  ];

  return (
    <div className="space-y-4">
      {items.map(({ key, label, description }) => (
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

export default function SettingsPage() {
  useDocumentTitle('Settings');
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch(`${API_BASE}/users/me`, {
        method: 'DELETE',
        headers: getAuthHeaders(token),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data.error || 'Failed to delete account');
        return;
      }
      logout();
      navigate('/');
    } catch {
      setDeleteError('Failed to delete account. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-2xl font-extrabold text-stone-900 mb-2">Settings</h1>
      <p className="text-sm text-stone-500 mb-8">Manage your account, security, and subscription.</p>

      <div className="space-y-6">
        {/* Account */}
        <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-stone-100">
            <h2 className="font-bold text-sm">Account</h2>
          </div>
          <div className="px-6 py-5">
            <div className="flex justify-between items-center mb-6">
              <div>
                <div className="text-sm font-semibold">Email</div>
                <div className="text-sm text-stone-500">{user.email}</div>
              </div>
            </div>
            <div>
              <div className="text-sm font-semibold mb-3">Change Password</div>
              <PasswordSection token={token} />
            </div>
          </div>
        </div>

        {/* Linked Accounts */}
        <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-stone-100">
            <h2 className="font-bold text-sm">Linked Accounts</h2>
          </div>
          <div className="px-6 py-5">
            <LinkedAccounts />
          </div>
        </div>

        {/* Subscription */}
        <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-stone-100">
            <h2 className="font-bold text-sm">Subscription</h2>
          </div>
          <div className="px-6 py-5">
            <SubscriptionPage embedded />
          </div>
        </div>

        {/* Notifications */}
        <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-stone-100">
            <h2 className="font-bold text-sm">Notifications</h2>
          </div>
          <div className="px-6 py-5">
            <NotificationSection token={token} />
          </div>
        </div>

        {/* Danger Zone */}
        <div className="rounded-2xl border-2 border-red-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-red-200 bg-red-50">
            <h2 className="font-bold text-sm text-red-700">Danger Zone</h2>
          </div>
          <div className="px-6 py-5">
            <p className="text-sm text-stone-600 mb-4">
              Permanently delete your PetLink account and all associated data. This action cannot be undone.
            </p>
            {deleteError && <p className="text-red-500 text-sm mb-4">{deleteError}</p>}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors">
                  <Trash2 className="w-4 h-4" />
                  Delete My Account
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Your account will be deactivated immediately. Your data will be permanently deleted after 30 days. Active bookings must be completed first.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteAccount}
                    disabled={deleting}
                    className="bg-red-600 hover:bg-red-700 focus:ring-red-500"
                  >
                    {deleting ? 'Deleting...' : 'Yes, delete my account'}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>
    </div>
  );
}
