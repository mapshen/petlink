import React, { useEffect, useState } from 'react';
import { useAuth, getAuthHeaders } from '../context/AuthContext';
import { Booking } from '../types';
import { Calendar, Clock, MapPin, User, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const { user, token } = useAuth();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchBookings = async () => {
      try {
        const res = await fetch('/api/bookings', {
          headers: getAuthHeaders(token)
        });
        const data = await res.json();
        setBookings(data.bookings);
      } catch {
        // Silently handle — bookings fetch failed
      } finally {
        setLoading(false);
      }
    };
    fetchBookings();
  }, [user]);

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div></div>;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-stone-900 mb-8">Dashboard</h1>
      
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
                        src={otherPersonAvatar || `https://ui-avatars.com/api/?name=${otherPersonName}`} 
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
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
