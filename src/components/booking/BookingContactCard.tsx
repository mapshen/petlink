import { useState, useEffect } from 'react';
import { Phone, PhoneOff, User as UserIcon } from 'lucide-react';
import { getAuthHeaders } from '../../context/AuthContext';
import { API_BASE } from '../../config';

interface ContactInfo {
  name: string;
  avatar_url: string | null;
  phone: string | null;
  masked_phone: string | null;
  role: 'owner' | 'sitter';
}

interface Props {
  readonly bookingId: number;
  readonly bookingStatus: string;
  readonly token: string | null;
}

export default function BookingContactCard({ bookingId, bookingStatus, token }: Props) {
  const [contact, setContact] = useState<ContactInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isActive = bookingStatus === 'confirmed' || bookingStatus === 'in_progress';

  useEffect(() => {
    if (!isActive) return;

    const fetchContact = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`${API_BASE}/bookings/${bookingId}/contact`, {
          headers: getAuthHeaders(token),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(data.error || 'Failed to load contact');
          return;
        }
        const data = await res.json();
        setContact(data.contact);
      } catch {
        setError('Failed to load contact info');
      } finally {
        setLoading(false);
      }
    };

    fetchContact();
  }, [bookingId, bookingStatus, token, isActive]);

  if (!isActive) return null;

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-stone-100 p-4 animate-pulse">
        <div className="h-4 bg-stone-200 rounded w-24 mb-3" />
        <div className="h-10 bg-stone-200 rounded w-full" />
      </div>
    );
  }

  if (error) return null;
  if (!contact) return null;

  const roleLabel = contact.role === 'sitter' ? 'Sitter' : 'Owner';

  return (
    <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-100 bg-stone-50">
        <h3 className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
          {roleLabel} Contact
        </h3>
      </div>
      <div className="p-4">
        <div className="flex items-center gap-3">
          {contact.avatar_url ? (
            <img
              src={contact.avatar_url}
              alt={contact.name}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <UserIcon className="w-5 h-5 text-emerald-600" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-stone-900">{contact.name}</div>
            {contact.masked_phone ? (
              <div className="text-xs text-stone-500">{contact.masked_phone}</div>
            ) : (
              <div className="text-xs text-stone-400 flex items-center gap-1">
                <PhoneOff className="w-3 h-3" />
                Phone not shared
              </div>
            )}
          </div>
          {contact.phone && (
            <a
              href={`tel:${contact.phone}`}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors"
            >
              <Phone className="w-4 h-4" />
              Call
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
