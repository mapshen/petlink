import { useState, useEffect } from 'react';
import { getAuthHeaders } from '../../context/AuthContext';
import { API_BASE } from '../../config';
import type { PostComment } from '../../types';

interface PostCommentsProps {
  postId: number;
  token: string | null;
  userId?: number;
}

export default function PostComments({ postId, token, userId }: PostCommentsProps) {
  const [comments, setComments] = useState<PostComment[]>([]);
  const [total, setTotal] = useState(0);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setError(null);
    fetch(`${API_BASE}/posts/${postId}/comments?limit=20`, { headers: getAuthHeaders(token) })
      .then(r => {
        if (!r.ok) throw new Error('Failed to load comments');
        return r.json();
      })
      .then(data => {
        setComments(data.comments || []);
        setTotal(data.total || 0);
      })
      .catch(err => setError(err.message));
  }, [postId, token]);

  async function addComment() {
    if (!input.trim() || !token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/posts/${postId}/comments`, {
        method: 'POST',
        headers: { ...getAuthHeaders(token), 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: input.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to add comment');
        return;
      }
      const data = await res.json();
      setComments(prev => [...prev, data.comment]);
      setTotal(prev => prev + 1);
      setInput('');
    } catch {
      setError('Failed to add comment');
    } finally {
      setLoading(false);
    }
  }

  async function deleteComment(commentId: number) {
    if (!token) return;
    const prev = comments;
    // Optimistic remove
    setComments(c => c.filter(x => x.id !== commentId));
    setTotal(t => t - 1);
    try {
      const res = await fetch(`${API_BASE}/posts/comments/${commentId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(token),
      });
      if (!res.ok) {
        // Revert
        setComments(prev);
        setTotal(t => t + 1);
        setError('Failed to delete comment');
      }
    } catch {
      setComments(prev);
      setTotal(t => t + 1);
      setError('Failed to delete comment');
    }
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-1.5">{error}</div>
      )}
      {comments.map(c => (
        <div key={c.id} className="flex gap-2">
          <div className="w-7 h-7 rounded-full bg-stone-100 flex items-center justify-center text-[10px] font-medium flex-shrink-0 overflow-hidden">
            {c.author_avatar_url ? (
              <img src={c.author_avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              (c.author_name || '?')[0].toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-xs font-semibold text-stone-700">{c.author_name}</span>
            <span className="text-xs text-stone-500 ml-1">{c.content}</span>
            {c.author_id === userId && (
              <button onClick={() => deleteComment(c.id)} className="text-[10px] text-stone-400 hover:text-red-500 ml-2">delete</button>
            )}
          </div>
        </div>
      ))}
      {total > comments.length && (
        <button className="text-xs text-emerald-600 font-medium">View all {total} comments</button>
      )}
      <div className="flex gap-2 pt-1 border-t border-stone-100">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addComment()}
          placeholder="Add a comment..."
          className="flex-1 text-sm border border-stone-200 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
          maxLength={1000}
        />
        <button
          onClick={addComment}
          disabled={!input.trim() || loading}
          className="px-3 py-1.5 text-sm text-emerald-600 font-medium hover:bg-emerald-50 rounded-lg disabled:opacity-50"
        >
          Post
        </button>
      </div>
    </div>
  );
}
