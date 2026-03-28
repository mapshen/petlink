import React, { useState, useEffect } from 'react';
import { X, Copy, Check, RefreshCw, Link2Off } from 'lucide-react';
import { API_BASE } from '../../config';

interface CalendarExportDialogProps {
  onClose: () => void;
}

export default function CalendarExportDialog({ onClose }: CalendarExportDialogProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const token = localStorage.getItem('petlink_token');

  const generateToken = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/calendar/token`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to generate link');
      const data = await res.json();
      setUrl(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate link');
    } finally {
      setLoading(false);
    }
  };

  const revokeToken = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/calendar/token`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to revoke link');
      setUrl(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke link');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    generateToken();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200">
          <h3 className="text-lg font-bold text-stone-900">Subscribe to Calendar</h3>
          <button type="button" onClick={onClose} className="p-1 rounded-lg hover:bg-stone-100 text-stone-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-stone-600">
            Add your PetLink calendar to Google Calendar, Apple Calendar, or Outlook by subscribing with this URL.
          </p>

          {url && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={url}
                className="flex-1 rounded-lg border border-stone-300 px-3 py-2 text-xs text-stone-600 bg-stone-50 truncate"
              />
              <button
                type="button"
                onClick={copyToClipboard}
                className="shrink-0 p-2 rounded-lg border border-stone-300 hover:bg-stone-50 transition-colors"
                title="Copy URL"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-stone-500" />}
              </button>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-2">
            {url && (
              <>
                <button
                  type="button"
                  onClick={generateToken}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-stone-300 text-sm font-medium text-stone-700 hover:bg-stone-50 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Regenerate
                </button>
                <button
                  type="button"
                  onClick={revokeToken}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                >
                  <Link2Off className="w-3.5 h-3.5" />
                  Revoke
                </button>
              </>
            )}
            {!url && !loading && (
              <button
                type="button"
                onClick={generateToken}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
              >
                Generate Link
              </button>
            )}
          </div>

          {loading && (
            <div className="flex justify-center py-2">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-emerald-600"></div>
            </div>
          )}

          <div className="pt-2 border-t border-stone-100">
            <p className="text-xs text-stone-400">
              This URL contains a private token. Anyone with this link can view your schedule. Regenerating will invalidate the old link.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
