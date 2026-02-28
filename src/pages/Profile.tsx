import React, { useState, useEffect, useRef } from 'react';
import { useAuth, getAuthHeaders } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Save, Camera, Loader2, AlertCircle } from 'lucide-react';
import { API_BASE } from '../config';
import { useImageUpload } from '../hooks/useImageUpload';

export default function Profile() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [role, setRole] = useState<'owner' | 'sitter' | 'both'>('owner');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploading, progress, error: uploadError, upload, clearError } = useImageUpload(token);

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    clearError();
    const url = await upload(file, 'avatars');
    if (url) setAvatarUrl(url);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    setName(user.name);
    setBio(user.bio || '');
    setAvatarUrl(user.avatar_url || '');
    setRole(user.role);
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');

    try {
      const res = await fetch(`${API_BASE}/users/me`, {
        method: 'PUT',
        headers: getAuthHeaders(token),
        body: JSON.stringify({ name, bio, avatar_url: avatarUrl, role }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Update failed');
      }

      const data = await res.json();
      // Update localStorage with new user data
      localStorage.setItem('petlink_user', JSON.stringify(data.user));
      setMessage('Profile updated successfully');
      // Reload to update auth context
      window.location.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const toggleRole = () => {
    if (role === 'owner') setRole('sitter');
    else if (role === 'sitter') setRole('owner');
    else setRole('owner'); // 'both' toggles to 'owner'
  };

  const enableBothRoles = () => setRole('both');

  if (!user) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-stone-900 mb-8">Edit Profile</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-stone-100 p-8 space-y-6">
        {/* Avatar upload */}
        <div className="flex items-center gap-4">
          <div className="relative group">
            <img
              src={avatarUrl || `https://ui-avatars.com/api/?name=${name}`}
              alt={name}
              className="w-20 h-20 rounded-full border-4 border-emerald-50 object-cover"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              {uploading ? (
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              ) : (
                <Camera className="w-5 h-5 text-white" />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleAvatarUpload}
              className="hidden"
            />
          </div>
          <div className="flex-grow">
            <p className="text-sm font-medium text-stone-700">Profile Photo</p>
            <p className="text-xs text-stone-400 mt-0.5">JPEG, PNG, WebP or GIF. Max 5MB.</p>
            {uploading && (
              <div className="mt-2 w-full bg-stone-100 rounded-full h-1.5">
                <div className="bg-emerald-500 h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            )}
            {uploadError && (
              <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {uploadError}
              </p>
            )}
          </div>
        </div>

        {/* Name */}
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Name</label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>

        {/* Bio */}
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Bio</label>
          <textarea
            rows={4}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Tell us about yourself..."
            className="w-full p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>

        {/* Role toggle */}
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-3">Account Mode</label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setRole('owner')}
              className={`flex-1 p-3 rounded-lg border text-sm font-medium transition-all ${
                role === 'owner' || role === 'both'
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                  : 'border-stone-200 text-stone-500 hover:border-emerald-200'
              }`}
            >
              Pet Parent
            </button>
            <button
              type="button"
              onClick={() => setRole('sitter')}
              className={`flex-1 p-3 rounded-lg border text-sm font-medium transition-all ${
                role === 'sitter' || role === 'both'
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                  : 'border-stone-200 text-stone-500 hover:border-emerald-200'
              }`}
            >
              Sitter
            </button>
            <button
              type="button"
              onClick={enableBothRoles}
              className={`flex-1 p-3 rounded-lg border text-sm font-medium transition-all ${
                role === 'both'
                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                  : 'border-stone-200 text-stone-500 hover:border-emerald-200'
              }`}
            >
              Both
            </button>
          </div>
        </div>

        {message && (
          <div className={`text-sm text-center p-2 rounded-lg ${
            message.includes('success') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
          }`}>
            {message}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-emerald-600 text-white py-3 rounded-lg font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}
