import React, { useEffect, useState, useRef } from 'react';
import { useAuth, getAuthHeaders } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { SitterPhoto } from '../types';
import { useImageUpload } from '../hooks/useImageUpload';
import { Trash2, ArrowUp, ArrowDown, Camera, Loader2, AlertCircle } from 'lucide-react';
import { API_BASE } from '../config';

export default function Photos() {
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [photos, setPhotos] = useState<SitterPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editCaption, setEditCaption] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploading, progress, error: uploadError, upload, clearError } = useImageUpload(token);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    if (user.role === 'owner') { navigate('/dashboard'); return; }
    fetchPhotos();
  }, [user, navigate]);

  const fetchPhotos = async () => {
    try {
      const res = await fetch(`${API_BASE}/sitter-photos/${user?.id}`, {
        headers: getAuthHeaders(token),
      });
      if (!res.ok) throw new Error('Failed to load photos');
      const data = await res.json();
      setPhotos(data.photos);
    } catch {
      setError('Failed to load photos.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    clearError();
    setError(null);
    const url = await upload(file, 'avatars');
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!url) return;

    try {
      const res = await fetch(`${API_BASE}/sitter-photos`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          photo_url: url,
          caption,
          sort_order: photos.length,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save photo');
      }
      const data = await res.json();
      setPhotos((prev) => [...prev, data.photo]);
      setCaption('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save photo');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this photo?')) return;
    setDeletingId(id);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/sitter-photos/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(token),
      });
      if (!res.ok) throw new Error('Failed to delete');
      setPhotos((prev) => prev.filter((p) => p.id !== id));
    } catch {
      setError('Failed to delete photo.');
    } finally {
      setDeletingId(null);
    }
  };

  const movePhoto = async (id: number, direction: -1 | 1) => {
    const idx = photos.findIndex((p) => p.id === id);
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= photos.length) return;

    const reordered = [...photos];
    [reordered[idx], reordered[newIdx]] = [reordered[newIdx], reordered[idx]];
    const updated = reordered.map((p, i) => ({ ...p, sort_order: i }));
    setPhotos(updated);

    // Persist both sort_order changes
    try {
      await Promise.all([
        fetch(`${API_BASE}/sitter-photos/${updated[idx].id}`, {
          method: 'PUT',
          headers: getAuthHeaders(token),
          body: JSON.stringify({ sort_order: idx }),
        }),
        fetch(`${API_BASE}/sitter-photos/${updated[newIdx].id}`, {
          method: 'PUT',
          headers: getAuthHeaders(token),
          body: JSON.stringify({ sort_order: newIdx }),
        }),
      ]);
    } catch {
      // Rollback on failure
      setPhotos(photos);
      setError('Failed to reorder photos');
    }
  };

  const saveCaption = async (id: number) => {
    try {
      const res = await fetch(`${API_BASE}/sitter-photos/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders(token),
        body: JSON.stringify({ caption: editCaption }),
      });
      if (!res.ok) throw new Error('Failed to update');
      const data = await res.json();
      setPhotos((prev) => prev.map((p) => (p.id === id ? data.photo : p)));
      setEditingId(null);
    } catch {
      setError('Failed to update caption.');
    }
  };

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div></div>;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-stone-900 mb-8">My Photos</h1>

      {error && (
        <div role="alert" className="mb-6 flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span className="flex-grow">{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-xs font-medium">Dismiss</button>
        </div>
      )}

      {/* Upload Section */}
      {photos.length < 10 && (
        <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 mb-8">
          <h2 className="text-lg font-bold text-stone-900 mb-4">Add Photo</h2>
          <div className="space-y-3">
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Caption (optional)"
              maxLength={200}
              className="w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                {uploading ? 'Uploading...' : 'Choose Photo'}
              </button>
              <span className="text-xs text-stone-400">{photos.length}/10 photos</span>
            </div>
            {uploading && (
              <div className="w-full bg-stone-100 rounded-full h-1.5">
                <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            )}
            {uploadError && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {uploadError}
              </p>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleUpload}
              className="hidden"
            />
          </div>
        </div>
      )}

      {/* Photo List */}
      <div className="space-y-4">
        {photos.map((photo, idx) => (
          <div key={photo.id} className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden flex">
            <img
              src={photo.photo_url}
              alt={photo.caption || `Photo ${idx + 1}`}
              className="w-32 h-32 object-cover flex-shrink-0"
            />
            <div className="flex-grow p-4 flex flex-col justify-between">
              {editingId === photo.id ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editCaption}
                    onChange={(e) => setEditCaption(e.target.value)}
                    maxLength={200}
                    className="flex-grow px-2 py-1 border border-stone-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    onClick={() => saveCaption(photo.id)}
                    className="text-xs px-3 py-1 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="text-xs px-3 py-1 text-stone-500 hover:text-stone-700"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setEditingId(photo.id); setEditCaption(photo.caption || ''); }}
                  className="text-sm text-stone-600 text-left hover:text-emerald-600"
                >
                  {photo.caption || 'Add caption...'}
                </button>
              )}
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => movePhoto(photo.id, -1)}
                  disabled={idx === 0}
                  className="p-1.5 text-stone-400 hover:text-stone-600 disabled:opacity-30 rounded-lg hover:bg-stone-100"
                  title="Move up"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => movePhoto(photo.id, 1)}
                  disabled={idx === photos.length - 1}
                  className="p-1.5 text-stone-400 hover:text-stone-600 disabled:opacity-30 rounded-lg hover:bg-stone-100"
                  title="Move down"
                >
                  <ArrowDown className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(photo.id)}
                  disabled={deletingId === photo.id}
                  className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 ml-auto"
                  title="Delete photo"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}

        {photos.length === 0 && (
          <div className="text-center py-12 bg-stone-50 rounded-2xl">
            <Camera className="w-12 h-12 mx-auto mb-4 text-stone-300" />
            <p className="text-stone-500 mb-2">No photos yet.</p>
            <p className="text-sm text-stone-400">Add photos of your home, yard, and walking areas to attract more bookings.</p>
          </div>
        )}
      </div>
    </div>
  );
}
