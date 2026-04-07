import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { API_BASE } from '../../config';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { ArrowLeft, Loader2, Pin, Lock, Trash2, Send } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ThreadDetail {
  id: number;
  category_id: number;
  title: string;
  content: string;
  pinned: boolean;
  locked: boolean;
  created_at: string;
  updated_at: string;
  author_id: number;
  author_name: string;
  author_avatar: string | null;
}

interface Reply {
  id: number;
  content: string;
  created_at: string;
  updated_at: string;
  author_id: number;
  author_name: string;
  author_avatar: string | null;
}

const PAGE_SIZE = 20;

export default function ThreadPage() {
  const { id } = useParams<{ id: string }>();
  const { user, token } = useAuth();
  const navigate = useNavigate();
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  useDocumentTitle(thread ? thread.title : 'Thread');

  const fetchThread = useCallback(async (pageOffset: number) => {
    try {
      setLoading(true);
      const res = await fetch(
        `${API_BASE}/forum/threads/${id}?limit=${PAGE_SIZE}&offset=${pageOffset}`,
        { headers: getAuthHeaders(token) }
      );
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to load thread');
        return;
      }
      const data = await res.json();
      setThread(data.thread);
      setReplies(data.replies);
      setTotal(data.total);
    } catch {
      setError('Failed to load thread');
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => {
    fetchThread(offset);
  }, [fetchThread, offset]);

  const handleSubmitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyContent.trim()) return;

    setSubmitting(true);
    setReplyError(null);
    try {
      const res = await fetch(`${API_BASE}/forum/threads/${id}/replies`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify({ content: replyContent.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setReplyError(data.error || 'Failed to post reply');
        return;
      }
      setReplyContent('');
      fetchThread(offset);
    } catch {
      setReplyError('Failed to post reply');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteThread = async () => {
    if (!confirm('Delete this thread? This cannot be undone.')) return;
    try {
      const res = await fetch(`${API_BASE}/forum/threads/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(token),
      });
      if (res.ok) {
        navigate('/forum');
      }
    } catch {
      // silent
    }
  };

  const handleDeleteReply = async (replyId: number) => {
    if (!confirm('Delete this reply?')) return;
    try {
      const res = await fetch(`${API_BASE}/forum/replies/${replyId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(token),
      });
      if (res.ok) {
        setReplies((prev) => prev.filter((r) => r.id !== replyId));
        setTotal((prev) => prev - 1);
      }
    } catch {
      // silent
    }
  };

  const isAdmin = user?.roles?.includes('admin');

  if (loading && !thread) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-700">{error}</p>
        </div>
      </div>
    );
  }

  if (!thread) return null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link to="/forum" className="inline-flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-700 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to Forum
      </Link>

      {/* Thread header */}
      <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-6 mb-4">
        <div className="flex items-center gap-2 mb-3">
          {thread.pinned && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 text-xs font-medium rounded-full">
              <Pin className="h-3 w-3" /> Pinned
            </span>
          )}
          {thread.locked && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-stone-100 text-stone-600 text-xs font-medium rounded-full">
              <Lock className="h-3 w-3" /> Locked
            </span>
          )}
        </div>
        <h1 className="text-xl font-bold text-stone-900 mb-3">{thread.title}</h1>
        <div className="flex items-center gap-3 mb-4">
          <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center overflow-hidden">
            {thread.author_avatar ? (
              <img src={thread.author_avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-sm font-medium text-emerald-700">
                {thread.author_name.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-stone-700">{thread.author_name}</p>
            <p className="text-xs text-stone-400">
              {formatDistanceToNow(new Date(thread.created_at), { addSuffix: true })}
            </p>
          </div>
          {(thread.author_id === user?.id || isAdmin) && (
            <button
              onClick={handleDeleteThread}
              className="ml-auto text-red-400 hover:text-red-600 transition-colors"
              title="Delete thread"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="text-stone-700 whitespace-pre-wrap">{thread.content}</div>
      </div>

      {/* Replies */}
      <div className="space-y-3 mb-6">
        <h2 className="text-sm font-medium text-stone-500">
          {total} {total === 1 ? 'reply' : 'replies'}
        </h2>
        {replies.map((reply) => (
          <div key={reply.id} className="bg-white rounded-xl shadow-sm border border-stone-200 p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-7 w-7 rounded-full bg-emerald-100 flex items-center justify-center overflow-hidden">
                {reply.author_avatar ? (
                  <img src={reply.author_avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xs font-medium text-emerald-700">
                    {reply.author_name.charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-stone-700">{reply.author_name}</p>
                <p className="text-xs text-stone-400">
                  {formatDistanceToNow(new Date(reply.created_at), { addSuffix: true })}
                </p>
              </div>
              {(reply.author_id === user?.id || isAdmin) && (
                <button
                  onClick={() => handleDeleteReply(reply.id)}
                  className="ml-auto text-red-400 hover:text-red-600 transition-colors"
                  title="Delete reply"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <p className="text-stone-700 text-sm whitespace-pre-wrap">{reply.content}</p>
          </div>
        ))}
      </div>

      {total > PAGE_SIZE && (
        <div className="flex justify-center gap-2 mb-6">
          <button
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            className="px-4 py-2 text-sm rounded-lg border border-stone-200 disabled:opacity-50 hover:bg-stone-50 transition-colors"
          >
            Previous
          </button>
          <span className="px-4 py-2 text-sm text-stone-500">
            {Math.floor(offset / PAGE_SIZE) + 1} of {Math.ceil(total / PAGE_SIZE)}
          </span>
          <button
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
            className="px-4 py-2 text-sm rounded-lg border border-stone-200 disabled:opacity-50 hover:bg-stone-50 transition-colors"
          >
            Next
          </button>
        </div>
      )}

      {/* Reply form */}
      {!thread.locked ? (
        <form onSubmit={handleSubmitReply} className="bg-white rounded-2xl shadow-sm border border-stone-200 p-4">
          <textarea
            value={replyContent}
            onChange={(e) => setReplyContent(e.target.value)}
            placeholder="Write a reply..."
            rows={3}
            maxLength={2000}
            className="w-full border border-stone-200 rounded-lg p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
          />
          {replyError && <p className="text-red-500 text-xs mt-1">{replyError}</p>}
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-stone-400">{replyContent.length}/2000</span>
            <button
              type="submit"
              disabled={submitting || !replyContent.trim()}
              className="flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Reply
            </button>
          </div>
        </form>
      ) : (
        <div className="bg-stone-50 rounded-xl border border-stone-200 p-4 text-center text-sm text-stone-500">
          <Lock className="h-4 w-4 inline-block mr-1" />
          This thread is locked. No new replies can be posted.
        </div>
      )}
    </div>
  );
}
