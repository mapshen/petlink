import { useEffect, useState } from 'react';
import { Video, ImageIcon, AlertCircle } from 'lucide-react';
import { isToday, isYesterday, format } from 'date-fns';
import { API_BASE } from '../../config';
import type { SitterPost } from '../../types';

const PAGE_SIZE = 12;

export function formatPostDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'MMM d');
}

interface Props {
  readonly sitterId: number;
  readonly onTotalLoaded?: (total: number) => void;
}

export default function PostsGrid({ sitterId, onTotalLoaded }: Props) {
  const [posts, setPosts] = useState<SitterPost[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [offset, setOffset] = useState(0);

  // Reset state when sitterId changes
  useEffect(() => {
    setPosts([]);
    setTotal(0);
    setOffset(0);
    setFetchError(false);
  }, [sitterId]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setFetchError(false);

    fetch(`${API_BASE}/sitter-posts/${sitterId}?limit=${PAGE_SIZE}&offset=${offset}`, {
      signal: controller.signal,
    })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data) {
          setPosts((prev) => offset === 0 ? data.posts : [...prev, ...data.posts]);
          setTotal(data.total);
          onTotalLoaded?.(data.total);
        }
      })
      .catch((err) => {
        if (err.name !== 'AbortError') setFetchError(true);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [sitterId, offset]);

  if (loading && posts.length === 0) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (fetchError && posts.length === 0) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="w-12 h-12 text-red-300 mx-auto mb-3" />
        <p className="text-stone-500">Failed to load posts</p>
        <button
          onClick={() => { setFetchError(false); setOffset(0); }}
          className="text-sm text-emerald-600 mt-2 hover:text-emerald-700"
        >
          Retry
        </button>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="text-center py-12">
        <ImageIcon className="w-12 h-12 text-stone-300 mx-auto mb-3" />
        <p className="text-stone-500">No posts yet</p>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-1">
        {posts.map((post) => (
          <div
            key={post.id}
            className="aspect-square relative overflow-hidden bg-stone-200 cursor-pointer hover:opacity-90 transition-opacity"
          >
            {post.photo_url ? (
              <img src={post.photo_url} alt={post.content || 'Post'} className="w-full h-full object-cover" />
            ) : post.video_url ? (
              <div className="w-full h-full bg-stone-300 flex items-center justify-center">
                <Video className="w-8 h-8 text-white" />
              </div>
            ) : (
              <div className="w-full h-full bg-emerald-50 flex items-center justify-center p-3">
                <p className="text-xs text-stone-600 line-clamp-4 text-center">{post.content}</p>
              </div>
            )}

            {/* Video icon overlay */}
            {post.video_url && post.photo_url && (
              <div className="absolute top-2 right-2">
                <Video className="w-4 h-4 text-white drop-shadow" />
              </div>
            )}

            {/* Bottom gradient with caption */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
              {post.content && (
                <p className="text-[11px] text-white font-semibold line-clamp-1">{post.content}</p>
              )}
              <p className="text-[10px] text-white/70">{formatPostDate(post.created_at)}</p>
            </div>
          </div>
        ))}
      </div>

      {posts.length < total && (
        <div className="flex justify-center py-4">
          <button
            onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
            disabled={loading}
            className="text-sm font-medium text-emerald-600 hover:text-emerald-700 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}
