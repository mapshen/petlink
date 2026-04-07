import React, { useState } from 'react';
import { AlertTriangle, X, MapPin, Clock, Phone, CheckCircle, XCircle, Loader2, Users } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import type { LostPetAlert } from '../../types';

interface AlertDetailCardProps {
  alert: LostPetAlert;
  isOwner: boolean;
  onResolve: (alertId: number, status: 'found' | 'cancelled') => Promise<void>;
  onClose: () => void;
}

export default function AlertDetailCard({ alert, isOwner, onResolve, onClose }: AlertDetailCardProps) {
  const [resolving, setResolving] = useState(false);

  const handleResolve = async (status: 'found' | 'cancelled') => {
    setResolving(true);
    try {
      await onResolve(alert.id, status);
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-stone-100">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <h2 className="font-bold text-stone-800">Lost Pet Alert</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-stone-100">
            <X className="w-5 h-5 text-stone-400" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Pet info */}
          <div className="flex items-start gap-4">
            {(alert.photo_url || alert.pet_photo_url) && (
              <img
                src={alert.photo_url || alert.pet_photo_url || ''}
                alt={alert.pet_name || 'Pet'}
                className="w-20 h-20 rounded-xl object-cover flex-shrink-0"
              />
            )}
            <div>
              <h3 className="font-bold text-lg text-stone-800">{alert.pet_name}</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">
                  {alert.pet_species}
                </span>
                {alert.pet_breed && (
                  <span className="text-xs text-stone-400">{alert.pet_breed}</span>
                )}
              </div>
              {alert.owner_name && (
                <p className="text-sm text-stone-500 mt-1">
                  Reported by {alert.owner_name}
                </p>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
            <p className="text-sm text-amber-900 leading-relaxed">{alert.description}</p>
          </div>

          {/* Details */}
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm">
              <Clock className="w-4 h-4 text-stone-400" />
              <span className="text-stone-600">
                Last seen {formatDistanceToNow(new Date(alert.last_seen_at), { addSuffix: true })}
                {' '}({format(new Date(alert.last_seen_at), 'MMM d, yyyy h:mm a')})
              </span>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <MapPin className="w-4 h-4 text-stone-400" />
              <span className="text-stone-600">
                Search radius: {alert.search_radius_miles} miles
              </span>
            </div>
            {alert.contact_phone && (
              <div className="flex items-center gap-3 text-sm">
                <Phone className="w-4 h-4 text-stone-400" />
                <a href={`tel:${alert.contact_phone}`} className="text-emerald-600 hover:underline">
                  {alert.contact_phone}
                </a>
              </div>
            )}
            {alert.notified_sitter_count != null && (
              <div className="flex items-center gap-3 text-sm">
                <Users className="w-4 h-4 text-stone-400" />
                <span className="text-stone-600">
                  {alert.notified_sitter_count} sitter{alert.notified_sitter_count !== 1 ? 's' : ''} notified
                </span>
              </div>
            )}
          </div>

          {/* Owner actions */}
          {isOwner && alert.status === 'active' && (
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => handleResolve('found')}
                disabled={resolving}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {resolving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                Mark as Found
              </button>
              <button
                onClick={() => handleResolve('cancelled')}
                disabled={resolving}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-stone-100 text-stone-700 rounded-xl font-medium hover:bg-stone-200 transition-colors disabled:opacity-50"
              >
                {resolving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <XCircle className="w-4 h-4" />
                )}
                Cancel Alert
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
