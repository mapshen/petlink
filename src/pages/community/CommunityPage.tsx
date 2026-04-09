import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { API_BASE } from '../../config';
import { TrendingUp, Users, MessageCircle } from 'lucide-react';
import type { CommunitySpace } from '../../types';

interface TrendingThread {
  id: number;
  title: string;
  content: string;
  created_at: string;
  space_name: string;
  space_slug: string;
  space_emoji: string;
  author_name: string;
  author_avatar?: string;
  reply_count: number;
}

function SpaceCard({ space }: { space: CommunitySpace }) {
  return (
    <Link
      to={`/community/${space.slug}`}
      className="bg-white rounded-2xl shadow-sm border border-stone-100 p-5 hover:shadow-md transition-all"
    >
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-xl bg-stone-100 flex items-center justify-center text-xl flex-shrink-0">
          {space.emoji || '💬'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-stone-800 text-sm">{space.name}</h3>
            {space.space_type === 'sitter_only' && (
              <span className="text-[10px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full font-medium">Sitters</span>
            )}
            {space.space_type === 'owner_only' && (
              <span className="text-[10px] bg-pink-100 text-pink-700 px-1.5 py-0.5 rounded-full font-medium">Owners</span>
            )}
            {space.space_type === 'everyone' && (
              <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">Everyone</span>
            )}
          </div>
          <p className="text-xs text-stone-500 mt-0.5 line-clamp-1">{space.description}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-stone-400">
            <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" /> {space.thread_count || 0} threads</span>
            {space.latest_activity && (
              <span>Active {formatRelativeTime(space.latest_activity)}</span>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

function TrendingThreadCard({ thread }: { thread: TrendingThread }) {
  return (
    <Link
      to={`/community/${thread.space_slug}/thread/${thread.id}`}
      className="bg-white rounded-2xl shadow-sm border border-stone-100 p-4 hover:shadow-md transition-all block"
    >
      <div className="flex gap-3">
        <div className="w-9 h-9 rounded-full bg-stone-100 flex items-center justify-center text-sm flex-shrink-0 overflow-hidden">
          {thread.author_avatar ? (
            <img src={thread.author_avatar} alt="" className="w-full h-full object-cover" />
          ) : (
            (thread.author_name || '?')[0].toUpperCase()
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold text-stone-800">{thread.author_name}</span>
            <span className="text-[10px] bg-stone-50 text-stone-500 px-1.5 py-0.5 rounded-full">
              {thread.space_emoji} {thread.space_name}
            </span>
          </div>
          <p className="text-sm text-stone-700 line-clamp-2">{thread.title || thread.content}</p>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-stone-400">
            <span className="flex items-center gap-1"><MessageCircle className="w-3 h-3" /> {thread.reply_count}</span>
            <span>{formatRelativeTime(thread.created_at)}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function CommunityPage() {
  useDocumentTitle('Community');
  const { token } = useAuth();
  const [spaces, setSpaces] = useState<CommunitySpace[]>([]);
  const [trending, setTrending] = useState<TrendingThread[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      fetch(`${API_BASE}/forum/categories`, { headers: getAuthHeaders(token) }).then(r => r.ok ? r.json() : { categories: [] }),
      fetch(`${API_BASE}/forum/trending`, { headers: getAuthHeaders(token) }).then(r => r.ok ? r.json() : { threads: [] }),
    ]).then(([catData, trendData]) => {
      setSpaces(catData.categories || []);
      setTrending(trendData.threads || []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="max-w-[960px] mx-auto py-8 px-4 flex justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-[960px] mx-auto py-6 px-4">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-stone-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-600" />
              Community
            </h1>
            <p className="text-sm text-stone-500 mt-1">Connect, learn, and share with fellow pet lovers</p>
          </div>
        </div>
      </div>

      {/* Spaces Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
        {spaces.map(space => (
          <SpaceCard key={space.id} space={space} />
        ))}
      </div>

      {/* Trending */}
      {trending.length > 0 && (
        <>
          <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wider mb-3 px-1 flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4" />
            Trending This Week
          </h2>
          <div className="space-y-3">
            {trending.map(thread => (
              <TrendingThreadCard key={thread.id} thread={thread} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
