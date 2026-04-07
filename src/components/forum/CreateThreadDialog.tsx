import React, { useState } from 'react';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { API_BASE } from '../../config';
import { X, Loader2 } from 'lucide-react';

interface Props {
  categoryId: number;
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateThreadDialog({ categoryId, onClose, onCreated }: Props) {
  const { token } = useAuth();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/forum/threads`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify({
          category_id: categoryId,
          title: title.trim(),
          content: content.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to create thread');
        return;
      }
      onCreated();
    } catch {
      setError('Failed to create thread');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-stone-200">
          <h2 className="text-lg font-semibold text-stone-900">New Thread</h2>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="What's on your mind?"
              className="w-full border border-stone-200 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
            <p className="text-xs text-stone-400 mt-1">{title.length}/200</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={5000}
              rows={6}
              placeholder="Share your thoughts, questions, or tips..."
              className="w-full border border-stone-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
            <p className="text-xs text-stone-400 mt-1">{content.length}/5000</p>
          </div>

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !title.trim() || !content.trim()}
              className="flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Post Thread
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
