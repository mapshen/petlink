import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { MapPin, Camera, Video } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useVideoUpload } from '../../hooks/useVideoUpload';

export default function TrackWalk() {
  const { bookingId } = useParams();
  const { user, token } = useAuth();
  const [elapsedTime, setElapsedTime] = useState(0);
  const [distance, setDistance] = useState(0);
  const [isTracking, setIsTracking] = useState(false);
  const [events, setEvents] = useState<{ type: 'pee' | 'poop' | 'photo' | 'video', time: string, lat: number, lng: number, video_url?: string }[]>([]);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const { uploading: videoUploading, upload: uploadVideo, error: videoError, clearError: clearVideoError } = useVideoUpload(token);

  // Mock GPS tracking
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTracking) {
      interval = setInterval(() => {
        setElapsedTime(prev => prev + 1);
        setDistance(prev => prev + 0.01); // Mock distance increment
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTracking]);

  const handleEvent = (type: 'pee' | 'poop' | 'photo' | 'video', video_url?: string) => {
    setEvents(prev => [...prev, {
      type,
      time: new Date().toLocaleTimeString(),
      lat: 37.7749 + (Math.random() * 0.01), // Mock lat
      lng: -122.4194 + (Math.random() * 0.01), // Mock lng
      video_url,
    }]);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="max-w-md mx-auto px-4 py-8 h-[calc(100vh-64px)] flex flex-col">
      <div className="bg-emerald-600 text-white p-6 rounded-2xl shadow-lg mb-6 text-center">
        <h1 className="text-2xl font-bold mb-2">Live Walk Tracker</h1>
        <div className="text-4xl font-mono font-bold mb-4">{formatTime(elapsedTime)}</div>
        <div className="flex justify-center gap-8 text-emerald-100">
          <div>
            <div className="text-2xl font-bold">{distance.toFixed(2)}</div>
            <div className="text-xs uppercase tracking-wider">Miles</div>
          </div>
          <div>
            <div className="text-2xl font-bold">{events.length}</div>
            <div className="text-xs uppercase tracking-wider">Events</div>
          </div>
        </div>
      </div>

      <div className="flex-grow bg-stone-100 rounded-2xl mb-6 relative overflow-hidden border border-stone-200">
        {/* Mock Map Background */}
        <div className="absolute inset-0 opacity-20 bg-[url('https://upload.wikimedia.org/wikipedia/commons/e/ec/San_Francisco_map.png')] bg-cover bg-center"></div>
        
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-white/80 backdrop-blur-sm p-4 rounded-xl shadow-sm text-center">
            <MapPin className="w-8 h-8 text-emerald-600 mx-auto mb-2 animate-bounce" />
            <p className="text-sm font-medium text-stone-600">Tracking location...</p>
          </div>
        </div>

        {/* Event Markers */}
        {events.map((event, i) => (
          <div key={i} className="absolute transform -translate-x-1/2 -translate-y-1/2" style={{ top: `${50 + (Math.random() * 40 - 20)}%`, left: `${50 + (Math.random() * 40 - 20)}%` }}>
            <div className={`p-2 rounded-full shadow-md ${
              event.type === 'pee' ? 'bg-yellow-400 text-white' :
              event.type === 'poop' ? 'bg-amber-700 text-white' :
              event.type === 'video' ? 'bg-rose-500 text-white' :
              'bg-blue-500 text-white'
            }`}>
              {event.type === 'pee' ? '💧' : event.type === 'poop' ? '💩' : event.type === 'video' ? <Video className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-3 mb-6">
        <button
          onClick={() => handleEvent('pee')}
          disabled={!isTracking}
          className="bg-yellow-100 text-yellow-700 p-4 rounded-xl flex flex-col items-center gap-2 hover:bg-yellow-200 transition-colors disabled:opacity-50"
        >
          <span className="text-2xl">💧</span>
          <span className="text-xs font-bold">Pee</span>
        </button>
        <button
          onClick={() => handleEvent('poop')}
          disabled={!isTracking}
          className="bg-amber-100 text-amber-800 p-4 rounded-xl flex flex-col items-center gap-2 hover:bg-amber-200 transition-colors disabled:opacity-50"
        >
          <span className="text-2xl">💩</span>
          <span className="text-xs font-bold">Poop</span>
        </button>
        <button
          onClick={() => handleEvent('photo')}
          disabled={!isTracking}
          className="bg-blue-100 text-blue-700 p-4 rounded-xl flex flex-col items-center gap-2 hover:bg-blue-200 transition-colors disabled:opacity-50"
        >
          <Camera className="w-6 h-6" />
          <span className="text-xs font-bold">Photo</span>
        </button>
        <button
          onClick={() => videoInputRef.current?.click()}
          disabled={!isTracking || videoUploading}
          className="bg-rose-100 text-rose-700 p-4 rounded-xl flex flex-col items-center gap-2 hover:bg-rose-200 transition-colors disabled:opacity-50"
        >
          <Video className="w-6 h-6" />
          <span className="text-xs font-bold">{videoUploading ? 'Uploading...' : 'Video'}</span>
        </button>
      </div>

      {/* Hidden video file input */}
      <input
        ref={videoInputRef}
        type="file"
        accept="video/mp4,video/quicktime,video/webm"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          clearVideoError();
          const publicUrl = await uploadVideo(file);
          if (publicUrl) {
            handleEvent('video', publicUrl);
          }
          if (videoInputRef.current) {
            videoInputRef.current.value = '';
          }
        }}
        className="hidden"
      />

      {/* Video upload error */}
      {videoError && (
        <div className="mb-4 text-xs text-red-600 bg-red-50 rounded-lg p-2 flex justify-between items-center">
          <span>{videoError}</span>
          <button type="button" onClick={clearVideoError} className="text-red-400 hover:text-red-600 ml-2">Dismiss</button>
        </div>
      )}

      {/* Video player for video events */}
      {events.filter(e => e.type === 'video' && e.video_url).length > 0 && (
        <div className="mb-6 space-y-3">
          <h3 className="text-sm font-bold text-stone-700">Video Clips</h3>
          {events.filter(e => e.type === 'video' && e.video_url).map((event, i) => (
            <div key={i} className="rounded-xl overflow-hidden border border-stone-200 bg-stone-50">
              <video
                src={event.video_url}
                controls
                playsInline
                muted
                preload="metadata"
                className="w-full max-h-48 object-contain bg-black"
              />
              <div className="px-3 py-1.5 text-xs text-stone-500">{event.time}</div>
            </div>
          ))}
        </div>
      )}

      <button 
        onClick={() => setIsTracking(!isTracking)}
        className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
          isTracking 
            ? 'bg-red-500 text-white hover:bg-red-600 shadow-red-200' 
            : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200'
        } shadow-lg`}
      >
        {isTracking ? 'End Walk' : 'Start Walk'}
      </button>
    </div>
  );
}
