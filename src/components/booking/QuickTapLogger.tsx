import React, { useState, useRef } from 'react';
import { API_BASE } from '../../config';
import { getAuthHeaders } from '../../context/AuthContext';
import { useVideoUpload } from '../../hooks/useVideoUpload';

const QUICK_ACTIONS = [
  { type: 'fed', label: 'Fed', icon: '🍽️', color: 'bg-amber-100 text-amber-700 hover:bg-amber-200' },
  { type: 'water', label: 'Water', icon: '💧', color: 'bg-blue-100 text-blue-700 hover:bg-blue-200' },
  { type: 'pee', label: 'Pee', icon: '🚽', color: 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200' },
  { type: 'poop', label: 'Poop', icon: '💩', color: 'bg-orange-100 text-orange-700 hover:bg-orange-200' },
  { type: 'medication', label: 'Meds', icon: '💊', color: 'bg-purple-100 text-purple-700 hover:bg-purple-200' },
  { type: 'play', label: 'Play', icon: '🎾', color: 'bg-green-100 text-green-700 hover:bg-green-200' },
  { type: 'nap_start', label: 'Nap', icon: '😴', color: 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200' },
  { type: 'photo', label: 'Photo', icon: '📸', color: 'bg-pink-100 text-pink-700 hover:bg-pink-200' },
  { type: 'video', label: 'Video', icon: '🎥', color: 'bg-rose-100 text-rose-700 hover:bg-rose-200' },
] as const;

interface Props {
  bookingId: number;
  token: string | null;
  pets: { id: number; name: string }[];
  onEventLogged?: () => void;
}

export default function QuickTapLogger({ bookingId, token, pets, onEventLogged }: Props) {
  const [logging, setLogging] = useState<string | null>(null);
  const [selectedPetId, setSelectedPetId] = useState<number | null>(pets.length === 1 ? pets[0].id : null);
  const [note, setNote] = useState('');
  const [showNote, setShowNote] = useState(false);
  const [lastLogged, setLastLogged] = useState<{ type: string; time: string } | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const { uploading: videoUploading, upload: uploadVideo, error: videoError, clearError: clearVideoError } = useVideoUpload(token);

  const logEvent = async (eventType: string, videoUrl?: string) => {
    setLogging(eventType);
    try {
      let lat: number | null = null;
      let lng: number | null = null;

      // Try to get GPS for location-relevant events
      if (['pee', 'poop', 'start', 'end', 'play'].includes(eventType) && navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, enableHighAccuracy: false });
          });
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        } catch {
          // GPS optional — continue without it
        }
      }

      const res = await fetch(`${API_BASE}/walks/${bookingId}/events`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          event_type: eventType,
          lat,
          lng,
          note: note || null,
          pet_id: selectedPetId,
          video_url: videoUrl || null,
        }),
      });

      if (res.ok) {
        setLastLogged({ type: eventType, time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) });
        setNote('');
        setShowNote(false);
        onEventLogged?.();
        setTimeout(() => setLastLogged(null), 3000);
      }
    } catch {
      // Silently fail
    } finally {
      setLogging(null);
    }
  };

  const handleVideoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    clearVideoError();
    setLogging('video');

    const publicUrl = await uploadVideo(file);
    if (publicUrl) {
      await logEvent('video', publicUrl);
    }
    setLogging(null);

    // Reset file input so the same file can be selected again
    if (videoInputRef.current) {
      videoInputRef.current.value = '';
    }
  };

  return (
    <div className="bg-white rounded-xl border border-stone-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-stone-900">Quick Log</h3>
        {lastLogged && (
          <span className="text-xs text-emerald-600 animate-pulse">
            {QUICK_ACTIONS.find(a => a.type === lastLogged.type)?.icon} Logged at {lastLogged.time}
          </span>
        )}
      </div>

      {/* Pet selector (if multiple pets) */}
      {pets.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {pets.map(pet => (
            <button
              key={pet.id}
              type="button"
              onClick={() => setSelectedPetId(pet.id)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                selectedPetId === pet.id
                  ? 'bg-emerald-600 text-white'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              {pet.name}
            </button>
          ))}
        </div>
      )}

      {/* Quick-tap buttons */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {QUICK_ACTIONS.map(action => (
          <button
            key={action.type}
            type="button"
            onClick={() => {
              if (action.type === 'video') {
                videoInputRef.current?.click();
              } else {
                logEvent(action.type);
              }
            }}
            disabled={logging !== null || videoUploading}
            className={`flex flex-col items-center justify-center p-3 rounded-xl text-center transition-all ${action.color} ${
              logging === action.type || (action.type === 'video' && videoUploading) ? 'scale-95 opacity-70' : ''
            } disabled:opacity-50`}
          >
            <span className="text-xl">{action.icon}</span>
            <span className="text-xs font-medium mt-1">
              {action.type === 'video' && videoUploading ? 'Uploading...' : action.label}
            </span>
          </button>
        ))}
      </div>

      {/* Hidden video file input */}
      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        onChange={handleVideoSelect}
        className="hidden"
      />

      {/* Video upload error */}
      {videoError && (
        <div className="mt-2 text-xs text-red-600 bg-red-50 rounded-lg p-2 flex justify-between items-center">
          <span>{videoError}</span>
          <button type="button" onClick={clearVideoError} className="text-red-400 hover:text-red-600 ml-2">Dismiss</button>
        </div>
      )}

      {/* Optional note */}
      <div className="mt-3">
        {showNote ? (
          <div className="flex gap-2">
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Add a note..."
              className="flex-grow p-2 text-sm border border-stone-200 rounded-lg"
              autoFocus
            />
            <button type="button" onClick={() => { setNote(''); setShowNote(false); }}
              className="text-xs text-stone-400 hover:text-stone-600">Cancel</button>
          </div>
        ) : (
          <button type="button" onClick={() => setShowNote(true)}
            className="text-xs text-stone-400 hover:text-stone-600">
            + Add note to next log
          </button>
        )}
      </div>
    </div>
  );
}
