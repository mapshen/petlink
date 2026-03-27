import React, { useState, useEffect } from 'react';
import { useAuth, getAuthHeaders } from '../context/AuthContext';
import { API_BASE } from '../config';
import { ImportedProfile, ImportedProfilePlatform } from '../types';
import { Plus, Trash2, X, Save, ExternalLink, Star, MessageSquare, Globe } from 'lucide-react';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';

const PLATFORM_CONFIG: Record<ImportedProfilePlatform, { label: string; bg: string; text: string }> = {
  rover: { label: 'Rover', bg: 'bg-red-100', text: 'text-red-700' },
  wag: { label: 'Wag', bg: 'bg-blue-100', text: 'text-blue-700' },
  care_com: { label: 'Care.com', bg: 'bg-purple-100', text: 'text-purple-700' },
  other: { label: 'Other', bg: 'bg-stone-100', text: 'text-stone-700' },
};

const PLATFORM_OPTIONS: { value: ImportedProfilePlatform; label: string }[] = [
  { value: 'rover', label: 'Rover' },
  { value: 'wag', label: 'Wag' },
  { value: 'care_com', label: 'Care.com' },
  { value: 'other', label: 'Other' },
];

interface FormState {
  platform: ImportedProfilePlatform;
  profile_url: string;
  display_name: string;
  review_count: string;
  avg_rating: string;
}

const INITIAL_FORM: FormState = {
  platform: 'rover',
  profile_url: '',
  display_name: '',
  review_count: '',
  avg_rating: '',
};

export default function ImportedProfiles() {
  const { user, token } = useAuth();
  const [profiles, setProfiles] = useState<ImportedProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteDialogId, setDeleteDialogId] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchProfiles();
  }, [user]);

  const fetchProfiles = async () => {
    try {
      const res = await fetch(`${API_BASE}/imported-profiles`, {
        headers: getAuthHeaders(token),
      });
      if (!res.ok) throw new Error('Failed to load profiles');
      const data = await res.json();
      setProfiles(data.profiles);
    } catch {
      setError('Failed to load imported profiles.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!form.profile_url.trim()) {
      setError('Profile URL is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        platform: form.platform,
        profile_url: form.profile_url.trim(),
      };
      if (form.display_name.trim()) body.display_name = form.display_name.trim();
      if (form.review_count.trim()) body.review_count = parseInt(form.review_count, 10);
      if (form.avg_rating.trim()) body.avg_rating = parseFloat(form.avg_rating);

      const res = await fetch(`${API_BASE}/imported-profiles`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to import profile');
      }
      setShowForm(false);
      setForm(INITIAL_FORM);
      fetchProfiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import profile');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`${API_BASE}/imported-profiles/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(token),
      });
      if (!res.ok) throw new Error('Failed to delete');
      setProfiles((prev) => prev.filter((p) => p.id !== id));
    } catch {
      setError('Failed to delete profile.');
    }
  };

  const updateForm = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-stone-900">Imported Profiles</h2>
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4" /> Import Profile
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-xs font-medium hover:underline">
              Dismiss
            </button>
          </AlertDescription>
        </Alert>
      )}

      {/* Import Form */}
      {showForm && (
        <div className="bg-stone-50 rounded-xl border border-stone-200 p-6 mb-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-stone-900">Import a Profile</h3>
            <button
              onClick={() => {
                setShowForm(false);
                setForm(INITIAL_FORM);
                setError(null);
              }}
              className="text-stone-400 hover:text-stone-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Platform</label>
            <select
              value={form.platform}
              onChange={(e) => updateForm('platform', e.target.value)}
              className="w-full p-3 border border-stone-200 rounded-lg text-sm"
            >
              {PLATFORM_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Profile URL *</label>
            <input
              type="url"
              value={form.profile_url}
              onChange={(e) => updateForm('profile_url', e.target.value)}
              placeholder="https://www.rover.com/members/your-profile/"
              className="w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1">Display Name</label>
            <input
              type="text"
              value={form.display_name}
              onChange={(e) => updateForm('display_name', e.target.value)}
              placeholder="Your name on that platform"
              maxLength={100}
              className="w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Review Count</label>
              <input
                type="number"
                value={form.review_count}
                onChange={(e) => updateForm('review_count', e.target.value)}
                placeholder="0"
                min="0"
                className="w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1">Average Rating</label>
              <input
                type="number"
                value={form.avg_rating}
                onChange={(e) => updateForm('avg_rating', e.target.value)}
                placeholder="5.0"
                min="0"
                max="5"
                step="0.1"
                className="w-full px-3 py-2.5 border border-stone-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleCreate} disabled={saving}>
              <Save className="w-4 h-4" /> {saving ? 'Importing...' : 'Import Profile'}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setShowForm(false);
                setForm(INITIAL_FORM);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Profile List */}
      {profiles.length === 0 && !showForm ? (
        <div className="text-center py-12 bg-stone-50 rounded-xl border border-stone-200">
          <Globe className="w-12 h-12 mx-auto mb-4 text-stone-300" />
          <p className="text-stone-500 mb-2">No imported profiles yet</p>
          <p className="text-sm text-stone-400 mb-6">
            Import your profiles from other pet-sitting platforms to showcase your experience.
          </p>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4" /> Import Profile
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {profiles.map((profile) => {
            const config = PLATFORM_CONFIG[profile.platform];
            return (
              <div
                key={profile.id}
                className="bg-white rounded-xl border border-stone-100 shadow-sm p-5"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-full ${config.bg} ${config.text}`}
                    >
                      {config.label}
                    </span>
                    {profile.display_name && (
                      <span className="text-sm font-medium text-stone-900 truncate">
                        {profile.display_name}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <a
                      href={profile.profile_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 text-stone-400 hover:text-emerald-600 rounded-lg hover:bg-emerald-50 transition-colors"
                      title="Open profile"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </a>
                    <button
                      onClick={() => setDeleteDialogId(profile.id)}
                      className="p-2 text-stone-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Stats row */}
                {(profile.review_count != null || profile.avg_rating != null) && (
                  <div className="flex items-center gap-4 mt-3">
                    {profile.avg_rating != null && (
                      <div className="flex items-center gap-1 text-sm text-stone-600">
                        <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                        <span className="font-medium">{profile.avg_rating.toFixed(1)}</span>
                      </div>
                    )}
                    {profile.review_count != null && (
                      <div className="flex items-center gap-1 text-sm text-stone-500">
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>
                          {profile.review_count} review{profile.review_count !== 1 ? 's' : ''}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <p className="text-xs text-stone-400 mt-2 truncate">{profile.profile_url}</p>
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog
        open={deleteDialogId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteDialogId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Imported Profile</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this imported profile?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleteDialogId !== null) handleDelete(deleteDialogId);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
