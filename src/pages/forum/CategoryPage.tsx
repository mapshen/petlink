import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { API_BASE } from '../../config';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { ArrowLeft, Loader2, Plus, Pin, Lock, MessageCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import CreateThreadDialog from '../../components/forum/CreateThreadDialog';

interface ForumCategory {
  id: number;
  name: string;
  slug: string;
  description: string;
}

interface ForumThread {
  id: number;
  title: string;
  content: string;
  pinned: boolean;
  locked: boolean;
  created_at: string;
  updated_at: string;
  author_id: number;
  author_name: string;
  author_avatar: string | null;
  reply_count: number;
}

const PAGE_SIZE = 20;

export default function CategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const { token } = useAuth();
  const [category, setCategory] = useState<ForumCategory | null>(null);
  const [threads, setThreads] = useState<ForumThread[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useDocumentTitle(category ? `${category.name} - Forum` : 'Forum');

  const fetchThreads = useCallback(async (pageOffset: number) => {
    try {
      setLoading(true);
      const res = await fetch(
        `${API_BASE}/forum/categories/${slug}/threads?limit=${PAGE_SIZE}&offset=${pageOffset}`,
        { headers: getAuthHeaders(token) }
      );
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to load threads');
        return;
      }
      const data = await res.json();
      setCategory(data.category);
      setThreads(data.threads);
      setTotal(data.total);
    } catch {
      setError('Failed to load threads');
    } finally {
      setLoading(false);
    }
  }, [slug, token]);

  useEffect(() => {
    fetchThreads(offset);
  }, [fetchThreads, offset]);

  const handleThreadCreated = () => {
    setShowCreate(false);
    setOffset(0);
    fetchThreads(0);
  };

  if (loading && !category) {
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

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Link to="/forum" className="inline-flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-700 mb-4">
        <ArrowLeft className="h-4 w-4" /> Back to Forum
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">{category?.name}</h1>
          <p className="text-stone-500 mt-1">{category?.description}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium shrink-0"
        >
          <Plus className="h-4 w-4" /> New Thread
        </button>
      </div>

      {threads.length === 0 && !loading ? (
        <div className="bg-white rounded-2xl shadow-sm border border-stone-200 p-8 text-center">
          <MessageCircle className="h-10 w-10 text-stone-300 mx-auto mb-3" />
          <p className="text-stone-500">No threads yet. Start the conversation!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {threads.map((thread) => (
            <Link
              key={thread.id}
              to={`/forum/threads/${thread.id}`}
              className="block bg-white rounded-xl shadow-sm border border-stone-200 p-4 hover:border-emerald-300 hover:shadow-md transition-all"
            >
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 overflow-hidden">
                  {thread.author_avatar ? (
                    <img src={thread.author_avatar} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-sm font-medium text-emerald-700">
                      {thread.author_name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {thread.pinned && <Pin className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                    {thread.locked && <Lock className="h-3.5 w-3.5 text-stone-400 shrink-0" />}
                    <h3 className="font-medium text-stone-900 truncate">{thread.title}</h3>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-stone-400">
                    <span>{thread.author_name}</span>
                    <span>{formatDistanceToNow(new Date(thread.created_at), { addSuffix: true })}</span>
                    <span>{thread.reply_count} {thread.reply_count === 1 ? 'reply' : 'replies'}</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="flex justify-center gap-2 mt-6">
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

      {showCreate && category && (
        <CreateThreadDialog
          categoryId={category.id}
          onClose={() => setShowCreate(false)}
          onCreated={handleThreadCreated}
        />
      )}
    </div>
  );
}
