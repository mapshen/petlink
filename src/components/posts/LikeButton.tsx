import { useState } from 'react';
import { Heart } from 'lucide-react';
import { getAuthHeaders } from '../../context/AuthContext';
import { API_BASE } from '../../config';

interface LikeButtonProps {
  postId: number;
  initialLiked: boolean;
  initialCount: number;
  token: string | null;
}

export default function LikeButton({ postId, initialLiked, initialCount, token }: LikeButtonProps) {
  const [liked, setLiked] = useState(initialLiked);
  const [count, setCount] = useState(initialCount);

  async function toggleLike() {
    if (!token) return;

    // Optimistic update
    const prevLiked = liked;
    const prevCount = count;
    setLiked(!liked);
    setCount(liked ? count - 1 : count + 1);

    const method = prevLiked ? 'DELETE' : 'POST';
    try {
      const res = await fetch(`${API_BASE}/posts/${postId}/like`, {
        method,
        headers: getAuthHeaders(token),
      });
      if (res.ok) {
        const data = await res.json();
        setLiked(data.liked);
        setCount(data.like_count);
      } else {
        // Revert on failure
        setLiked(prevLiked);
        setCount(prevCount);
      }
    } catch {
      // Revert on network error
      setLiked(prevLiked);
      setCount(prevCount);
    }
  }

  return (
    <button
      onClick={toggleLike}
      aria-label={liked ? 'Unlike post' : 'Like post'}
      className="flex items-center gap-1.5 text-sm transition-colors hover:text-red-500"
    >
      <Heart className={`w-4 h-4 ${liked ? 'fill-red-500 text-red-500' : 'text-stone-400'}`} />
      <span className={liked ? 'text-red-500' : 'text-stone-500'}>{count}</span>
    </button>
  );
}
