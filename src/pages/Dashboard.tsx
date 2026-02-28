import React, { useEffect, useState } from 'react';
import { useAuth, getAuthHeaders } from '../context/AuthContext';
import { Booking } from '../types';
import { Calendar, MapPin, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { API_BASE } from '../config';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const { user, token } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingIds, setUpdatingIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const fetchBookings = async () => {
      try {
        const res = await fetch(`${API_BASE}/bookings`, {
          headers: getAuthHeaders(token)
        });
        if (!res.ok) throw new Error('Failed to load bookings');
        const data = await res.json();
        setBookings(data.bookings);
      } catch {
        setError('Failed to load bookings. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    fetchBookings();
  }, [user, token]);

  const updateBookingStatus = async (bookingId: number, status: 'confirmed' | 'cancelled') => {
    if (status === 'cancelled' && !window.confirm('Are you sure? This cannot be undone.')) {
      return;
    }
    setUpdatingIds((prev) => new Set([...prev, bookingId]));
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/bookings/${bookingId}/status`, {
        method: 'PUT',
        headers: getAuthHeaders(token),
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to update booking');
      }
      const data = await res.json();
      setBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? { ...b, status: data.booking.status } : b))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update booking status.');
    } finally {
      setUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(bookingId);
        return next;
      });
    }
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div></div>;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-stone-900 mb-8">Dashboard</h1>

      {error && (
        <div role="alert" className="mb-6 flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-grow">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-xs font-medium">Dismiss</button>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden">
        <div className="border-b border-stone-100 px-6 py-4 bg-stone-50">
          <h2 className="font-bold text-stone-700">Your Bookings</h2>
        </div>

        {bookings.length === 0 ? (
          <div className="p-12 text-center text-stone-500">
            <Calendar className="w-12 h-12 mx-auto mb-4 text-stone-300" />
            <p>No bookings yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-stone-100">
            {bookings.map((booking) => {
              const isSitter = user?.id === booking.sitter_id;
              const otherPersonName = isSitter ? booking.owner_name : booking.sitter_name;
              const otherPersonAvatar = isSitter ? booking.owner_avatar : booking.sitter_avatar;

              return (
                <div key={booking.id} className="p-6 hover:bg-stone-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <img
                        src={otherPersonAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(otherPersonName)}`}
                        alt={otherPersonName}
                        className="w-12 h-12 rounded-full object-cover border border-stone-200"
                      />
                      <div>
                        <h3 className="font-bold text-stone-900">{otherPersonName}</h3>
                        <div className="text-sm text-stone-500 capitalize">{booking.service_type}</div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-sm font-medium text-stone-900">
                        {format(new Date(booking.start_time), 'MMM d, yyyy')}
                      </div>
                      <div className="text-xs text-stone-500">
                        {format(new Date(booking.start_time), 'h:mm a')} - {format(new Date(booking.end_time), 'h:mm a')}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                        ${booking.status === 'confirmed' ? 'bg-emerald-100 text-emerald-800' :
                          booking.status === 'pending' ? 'bg-amber-100 text-amber-800' :
                          booking.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                          'bg-stone-100 text-stone-800'}`}>
                        {booking.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {isSitter && booking.status === 'pending' && (
                        <>
                          <button
                            onClick={() => updateBookingStatus(booking.id, 'confirmed')}
                            disabled={updatingIds.has(booking.id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            Accept
                          </button>
                          <button
                            onClick={() => updateBookingStatus(booking.id, 'cancelled')}
                            disabled={updatingIds.has(booking.id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            Decline
                          </button>
                        </>
                      )}

                      {!isSitter && (booking.status === 'pending' || booking.status === 'confirmed') && (
                        <button
                          onClick={() => updateBookingStatus(booking.id, 'cancelled')}
                          disabled={updatingIds.has(booking.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors disabled:opacity-50"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Cancel
                        </button>
                      )}

                      {booking.status === 'in_progress' && (
                        <Link
                          to={`/track/${booking.id}`}
                          className="text-emerald-600 text-sm font-medium hover:text-emerald-700 flex items-center gap-1"
                        >
                          <MapPin className="w-4 h-4" />
                          Track Walk
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
