import { useState } from 'react';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { PawPrint, Loader2 } from 'lucide-react';
import { API_BASE } from '../../config';
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
} from '../ui/alert-dialog';

interface Props {
  readonly onSuccess?: () => void;
  readonly trigger?: React.ReactNode;
}

const STEPS = [
  { title: 'Set up your profile & services', description: 'Add your bio, services, photos, and pricing' },
  { title: 'Add references (optional)', description: 'Invite past clients or import reviews from other platforms' },
  { title: 'Submit & get approved', description: "We'll review your application and notify you once approved" },
];

export default function BecomeSitterDialog({ onSuccess, trigger }: Props) {
  const { token, updateUser } = useAuth();
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');

  const handleApply = async () => {
    setApplying(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE}/users/me/become-sitter`, {
        method: 'POST',
        headers: getAuthHeaders(token),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to submit application');
      }
      const data = await res.json();
      updateUser(data.user);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit application');
    } finally {
      setApplying(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {trigger || (
          <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-50 to-emerald-100 border border-emerald-200 text-emerald-700 text-sm font-semibold hover:from-emerald-100 hover:to-emerald-200 transition-all w-full">
            <PawPrint className="w-4 h-4" />
            Become a Sitter
          </button>
        )}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex justify-center mb-2">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center">
              <PawPrint className="w-7 h-7 text-emerald-600" />
            </div>
          </div>
          <AlertDialogTitle className="text-center">Become a Sitter</AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            Apply to offer pet care services on PetLink
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="bg-stone-50 rounded-xl p-4 my-2">
          <h3 className="text-sm font-bold mb-3">What happens next:</h3>
          <div className="space-y-3">
            {STEPS.map((step, i) => (
              <div key={step.title} className="flex gap-3 items-start">
                <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {i + 1}
                </div>
                <div>
                  <div className="text-sm font-semibold">{step.title}</div>
                  <div className="text-xs text-stone-500">{step.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="text-sm p-2 rounded-lg bg-red-50 text-red-700" role="alert">{error}</div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleApply} disabled={applying}>
            {applying ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Applying...</>
            ) : (
              'Apply to Become a Sitter'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
