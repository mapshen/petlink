import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { API_BASE } from '../../config';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '../../components/ui/alert-dialog';

interface Props {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export default function DeleteAccountDialog({ open, onOpenChange }: Props) {
  const { token, logout } = useAuth();
  const navigate = useNavigate();
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const handleDelete = async () => {
    if (confirmText !== 'DELETE') return;
    setDeleting(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/users/me`, {
        method: 'DELETE',
        headers: getAuthHeaders(token),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to delete account');
        return;
      }
      logout();
      navigate('/');
    } catch {
      setError('Failed to delete account. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setConfirmText('');
      setError('');
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
          <AlertDialogDescription>
            Your account will be deactivated immediately. Your data will be permanently
            deleted after 30 days. Active bookings must be completed first.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="py-3">
          <label className="block text-sm font-medium text-stone-700 mb-2">
            Type <span className="font-bold text-red-600">DELETE</span> to confirm
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            className="w-full p-3 border border-stone-200 rounded-lg text-sm focus:ring-red-500 focus:border-red-500"
          />
          {error && (
            <p className="text-red-500 text-sm mt-2" role="alert">{error}</p>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setConfirmText('')}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={deleting || confirmText !== 'DELETE'}
            className="bg-red-600 hover:bg-red-700 focus:ring-red-500 disabled:opacity-50"
          >
            {deleting ? 'Deleting...' : 'Yes, delete my account'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
