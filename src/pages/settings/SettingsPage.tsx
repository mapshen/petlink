import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { API_BASE } from '../../config';
import { User, KeyRound, Link2, Crown, Bell, Trash2 } from 'lucide-react';
import LinkedAccounts from '../../components/profile/LinkedAccounts';
import SubscriptionPage from '../profile/SubscriptionPage';
import PasswordSection from './PasswordSection';
import NotificationSection from './NotificationSection';
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

interface SectionDef {
  id: string;
  label: string;
  icon: React.ElementType;
}

const ALL_SECTIONS: SectionDef[] = [
  { id: 'account', label: 'Account', icon: User },
  { id: 'security', label: 'Security', icon: KeyRound },
  { id: 'linked', label: 'Linked Accounts', icon: Link2 },
  { id: 'subscription', label: 'Subscription', icon: Crown },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'danger', label: 'Danger Zone', icon: Trash2 },
];

export default function SettingsPage() {
  useDocumentTitle('Settings');
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const isSitter = user?.roles?.includes('sitter') ?? false;

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return;
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

  const visibleSections = ALL_SECTIONS.filter((s) => {
    if (s.id === 'subscription' && !isSitter) return false;
    return true;
  });

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-2xl font-extrabold text-stone-900 mb-2">Settings</h1>
      <p className="text-sm text-stone-500 mb-6">Manage your account, security, and subscription.</p>

      <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-6">
        {/* LEFT: Section Navigation */}
        <div>
          <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-3 md:sticky md:top-20">
            <nav className="flex md:flex-col gap-0.5 overflow-x-auto md:overflow-x-visible">
              {visibleSections.map((section) => {
                const Icon = section.icon;
                return (
                  <a
                    key={section.id}
                    href={`#settings-${section.id}`}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-stone-500 hover:bg-stone-50 hover:text-stone-900 whitespace-nowrap transition-colors"
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    {section.label}
                  </a>
                );
              })}
            </nav>
          </div>
        </div>

        {/* RIGHT: Settings Sections */}
        <div className="min-w-0 space-y-6">
          {/* Account */}
          <div id="settings-account" className="bg-white rounded-2xl border border-stone-100 overflow-hidden scroll-mt-24">
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
            </div>
          </div>

          {/* Security (Password) */}
          <div id="settings-security" className="bg-white rounded-2xl border border-stone-100 overflow-hidden scroll-mt-24">
            <div className="px-6 py-4 border-b border-stone-100">
              <h2 className="font-bold text-sm">Security</h2>
            </div>
            <div className="px-6 py-5">
              <PasswordSection token={token} />
            </div>
          </div>

          {/* Linked Accounts */}
          <div id="settings-linked" className="bg-white rounded-2xl border border-stone-100 overflow-hidden scroll-mt-24">
            <div className="px-6 py-4 border-b border-stone-100">
              <h2 className="font-bold text-sm">Linked Accounts</h2>
            </div>
            <div className="px-6 py-5">
              <LinkedAccounts embedded />
            </div>
          </div>

          {/* Subscription (sitters only) */}
          {isSitter && (
            <div id="settings-subscription" className="bg-white rounded-2xl border border-stone-100 overflow-hidden scroll-mt-24">
              <div className="px-6 py-4 border-b border-stone-100">
                <h2 className="font-bold text-sm">Subscription</h2>
              </div>
              <div className="px-6 py-5">
                <SubscriptionPage embedded />
              </div>
            </div>
          )}

          {/* Notifications */}
          <div id="settings-notifications" className="bg-white rounded-2xl border border-stone-100 overflow-hidden scroll-mt-24">
            <div className="px-6 py-4 border-b border-stone-100">
              <h2 className="font-bold text-sm">Notifications</h2>
            </div>
            <div className="px-6 py-5">
              <NotificationSection token={token} />
            </div>
          </div>

          {/* Danger Zone */}
          <div id="settings-danger" className="rounded-2xl border-2 border-red-200 overflow-hidden scroll-mt-24">
            <div className="px-6 py-4 border-b border-red-200 bg-red-50">
              <h2 className="font-bold text-sm text-red-700">Danger Zone</h2>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-stone-600 mb-4">
                Permanently delete your PetLink account and all associated data. This action cannot be undone.
              </p>
              {deleteError && <p className="text-red-500 text-sm mb-4" role="alert">{deleteError}</p>}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors">
                    <Trash2 className="w-4 h-4" />
                    Delete My Account
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Your account will be deactivated immediately. Your data will be permanently deleted after 30 days. Active bookings must be completed first.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="py-3">
                    <label className="block text-sm font-medium text-stone-700 mb-2">
                      Type <span className="font-bold text-red-600">DELETE</span> to confirm
                    </label>
                    <input
                      type="text"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      placeholder="DELETE"
                      className="w-full p-3 border border-stone-200 rounded-lg text-sm focus:ring-red-500 focus:border-red-500"
                    />
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setDeleteConfirmText('')}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteAccount}
                      disabled={deleting || deleteConfirmText !== 'DELETE'}
                      className="bg-red-600 hover:bg-red-700 focus:ring-red-500 disabled:opacity-50"
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
    </div>
  );
}
