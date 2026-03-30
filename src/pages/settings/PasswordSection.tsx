import { useState } from 'react';
import { getAuthHeaders } from '../../context/AuthContext';
import { Save } from 'lucide-react';
import { API_BASE } from '../../config';

export default function PasswordSection({ token }: { readonly token: string | null }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const passwordsMatch = newPassword === confirmPassword;
  const canSubmit = currentPassword && newPassword.length >= 8 && passwordsMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordsMatch) {
      setError('Passwords do not match');
      return;
    }
    setSaving(true);
    setSuccess('');
    setError('');
    try {
      const res = await fetch(`${API_BASE}/auth/password`, {
        method: 'PUT',
        headers: getAuthHeaders(token),
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to change password');
      setSuccess('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Current Password</label>
        <input
          type="password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          className="w-full p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">New Password</label>
        <input
          type="password"
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full p-3 border border-stone-200 rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
        />
        <p className="text-xs text-stone-400 mt-1">Minimum 8 characters</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Confirm New Password</label>
        <input
          type="password"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className={`w-full p-3 border rounded-lg focus:ring-emerald-500 focus:border-emerald-500 ${
            confirmPassword && !passwordsMatch ? 'border-red-300' : 'border-stone-200'
          }`}
        />
        {confirmPassword && !passwordsMatch && (
          <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
        )}
      </div>
      {success && <div className="text-sm p-2 rounded-lg bg-emerald-50 text-emerald-700" role="status">{success}</div>}
      {error && <div className="text-sm p-2 rounded-lg bg-red-50 text-red-700" role="alert">{error}</div>}
      <button
        type="submit"
        disabled={saving || !canSubmit}
        className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center gap-2"
      >
        <Save className="w-4 h-4" />
        {saving ? 'Saving...' : 'Change Password'}
      </button>
    </form>
  );
}
