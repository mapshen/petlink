import { useState, useEffect, useCallback } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { MessageCircle } from 'lucide-react';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { API_BASE } from '../../config';
import LikeButton from './LikeButton';
import PostComments from './PostComments';
import type { Post } from '../../types';

interface UniversalPostsGridProps {
  destinationType: 'profile' | 'pet';
  destinationId: number;
  onTotalLoaded?: (total: number) => void;
}

function formatPostDate(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'MMM d');
}

export default function UniversalPostsGrid({ destinationType, destinationId, onTotalLoaded }: UniversalPostsGridProps) {
  const { token, user } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expandedPost, setExpandedPost] = useState<number | null>(null);

  const fetchPosts = useCallback(async (offset: number) => {
    if (!token) return;
    try {
      setLoading(true);
      setError(false);
      const res = await fetch(
        `${API_BASE}/posts/destination/${destinationType}/${destinationId}?limit=12&offset=${offset}`,
        { headers: getAuthHeaders(token) }
      );
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPosts(prev => offset === 0 ? data.posts : [...prev, ...data.posts]);
      setTotal(data.total);
      onTotalLoaded?.(data.total);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [token, destinationType, destinationId, onTotalLoaded]);

  useEffect(() => {
    setPosts([]);
    setTotal(0);
    fetchPosts(0);
  }, [fetchPosts]);

  if (loading && posts.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-stone-500">
        <p className="text-sm">Failed to load posts</p>
        <button onClick={() => fetchPosts(0)} className="text-sm text-emerald-600 mt-2">Retry</button>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="text-center py-12 text-stone-400">
        <p className="text-sm">No posts yet</p>
      </div>
    );
  }

  return (
    <div>
      {/* Grid */}
      <div className="grid grid-cols-3 gap-1 rounded-xl overflow-hidden">
        {posts.map(post => (
          <div
            key={post.id}
            className="aspect-square relative cursor-pointer group bg-stone-100"
            onClick={() => setExpandedPost(expandedPost === post.id ? null : post.id)}
          >
            {post.photo_url ? (
              <img src={post.photo_url} alt="" className="w-full h-full object-cover" />
            ) : post.video_url ? (
              <div className="w-full h-full bg-stone-200 flex items-center justify-center text-stone-400">
                <span className="text-2xl">▶</span>
              </div>
            ) : (
              <div className="w-full h-full bg-emerald-50 flex items-center justify-center p-3">
                <p className="text-xs text-stone-600 line-clamp-4 text-center">{post.content}</p>
              </div>
            )}
            {/* Hover overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
              <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-3 text-white text-sm font-medium">
                <span>❤️ {post.like_count || 0}</span>
                <span>💬 {post.comment_count || 0}</span>
              </div>
            </div>
            {/* Pet tags */}
            {post.pet_tags && post.pet_tags.length > 0 && (
              <div className="absolute bottom-1.5 left-1.5 bg-white/90 backdrop-blur-sm rounded-full px-2 py-0.5 text-[10px] font-medium text-stone-700">
                {post.pet_tags[0].pet_name}
              </div>
            )}
            {/* Date */}
            <div className="absolute bottom-1.5 right-1.5 bg-black/50 rounded px-1.5 py-0.5 text-[10px] text-white">
              {formatPostDate(post.created_at)}
            </div>
          </div>
        ))}
      </div>

      {/* Expanded post */}
      {expandedPost && (() => {
        const post = posts.find(p => p.id === expandedPost);
        if (!post) return null;
        return (
          <div className="mt-4 bg-white rounded-2xl border border-stone-200 p-5 space-y-3">
            {/* Author */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-xs font-medium overflow-hidden">
                {post.author_avatar_url ? (
                  <img src={post.author_avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  (post.author_name || '?')[0].toUpperCase()
                )}
              </div>
              <span className="text-sm font-semibold text-stone-800">{post.author_name}</span>
              <span className="text-xs text-stone-400">{formatPostDate(post.created_at)}</span>
            </div>
            {/* Content */}
            {post.content && <p className="text-sm text-stone-700">{post.content}</p>}
            {post.photo_url && <img src={post.photo_url} alt="" className="rounded-xl max-h-96 w-full object-cover" />}
            {/* Pet tags */}
            {post.pet_tags && post.pet_tags.length > 0 && (
              <div className="flex gap-2">
                {post.pet_tags.map(tag => (
                  <span key={tag.pet_id} className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">
                    {tag.pet_name}
                  </span>
                ))}
              </div>
            )}
            {/* Like + comment count */}
            <div className="flex items-center gap-4 pt-2 border-t border-stone-100">
              <LikeButton postId={post.id} initialLiked={post.user_liked || false} initialCount={post.like_count || 0} token={token} />
              <button className="flex items-center gap-1.5 text-sm text-stone-400 hover:text-emerald-600">
                <MessageCircle className="w-4 h-4" />
                <span>{post.comment_count || 0}</span>
              </button>
            </div>
            {/* Comments */}
            <PostComments postId={post.id} token={token} userId={user?.id} />
          </div>
        );
      })()}

      {/* Load more */}
      {posts.length < total && (
        <div className="text-center pt-4">
          <button
            onClick={() => fetchPosts(posts.length)}
            className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
          >
            Load more posts
          </button>
        </div>
      )}
    </div>
  );
}
