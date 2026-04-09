import { useState } from 'react';
import { ShieldAlert, Phone, User, Heart } from 'lucide-react';
import { getAuthHeaders } from '../../context/AuthContext';
import { API_BASE } from '../../config';
import type { EmergencyContact } from '../../types';
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
  readonly bookingId: number;
  readonly otherPartyName: string;
  readonly token: string | null;
}

export default function EmergencyContactReveal({ bookingId, otherPartyName, token }: Props) {
  const [contact, setContact] = useState<EmergencyContact | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleReveal = async () => {
    setLoading(true);
    setError('');
    setDialogOpen(false);
    try {
      const res = await fetch(`${API_BASE}/bookings/${bookingId}/emergency-contact`, {
        method: 'POST',
        headers: getAuthHeaders(token),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.error === 'no_emergency_contact') {
          setError('No emergency contact on file');
        } else {
          setError(data.error || 'Failed to reveal');
        }
        setRevealed(true);
        return;
      }
      const data = await res.json();
      setContact(data.emergency_contact);
      setRevealed(true);
    } catch {
      setError('Failed to load emergency contact');
    } finally {
      setLoading(false);
    }
  };

  if (revealed && contact) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 mt-3" aria-live="polite" role="status">
        <div className="text-xs font-medium text-red-600 uppercase tracking-wider mb-2">
          Emergency Contact
        </div>
        <div className="space-y-1.5">
          {contact.name && (
            <div className="flex items-center gap-2 text-sm text-stone-700">
              <User className="w-3.5 h-3.5 text-stone-400" />
              {contact.name}
            </div>
          )}
          {contact.phone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="w-3.5 h-3.5 text-stone-400" />
              <a
                href={`tel:${contact.phone}`}
                className="text-red-600 font-medium hover:underline"
              >
                {contact.phone}
              </a>
            </div>
          )}
          {contact.relationship && (
            <div className="flex items-center gap-2 text-sm text-stone-500">
              <Heart className="w-3.5 h-3.5 text-stone-400" />
              {contact.relationship}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (revealed && error) {
    return (
      <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 mt-3 text-sm text-stone-500">
        {error}
      </div>
    );
  }

  return (
    <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          disabled={loading}
          className="mt-3 flex items-center gap-2 text-sm text-red-600 font-medium hover:text-red-700 disabled:opacity-50"
        >
          <ShieldAlert className="w-4 h-4" />
          {loading ? 'Loading...' : 'Reveal Emergency Contact'}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reveal Emergency Contact</AlertDialogTitle>
          <AlertDialogDescription>
            This will notify{' '}
            <span className="font-medium text-stone-700">{otherPartyName}</span>{' '}
            that you viewed their emergency contact. Only use this in case of an
            emergency.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleReveal}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            Continue
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
