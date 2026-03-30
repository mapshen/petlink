import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { API_BASE } from '../../config';
import { Trash2 } from 'lucide-react';
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
