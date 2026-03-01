import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config';

interface FavoriteSitter {
  id: number;
  sitter_id: number;
  created_at: string;
  sitter_name: string;
  sitter_avatar: string | null;
  sitter_bio: string | null;
}

export function useFavorites() {
  const { user, token } = useAuth();
  const [favoritedIds, setFavoritedIds] = useState<Set<number>>(new Set());
  const [favorites, setFavorites] = useState<FavoriteSitter[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user || !token) {
      setFavoritedIds(new Set());
      setFavorites([]);
      return;
    }

    setLoading(true);
    fetch(`${API_BASE}/favorites`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to load favorites'))))
      .then((data) => {
        const favs: FavoriteSitter[] = data.favorites;
        setFavorites(favs);
        setFavoritedIds(new Set(favs.map((f) => f.sitter_id)));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, token]);

  const toggleFavorite = useCallback(
    async (sitterId: number) => {
      if (!token) return;
      const wasFavorited = favoritedIds.has(sitterId);

      // Optimistic update
      setFavoritedIds((prev) => {
        const next = new Set(prev);
        if (wasFavorited) {
          next.delete(sitterId);
        } else {
          next.add(sitterId);
        }
        return next;
      });

      if (wasFavorited) {
        setFavorites((prev) => prev.filter((f) => f.sitter_id !== sitterId));
      }

      try {
        const res = await fetch(`${API_BASE}/favorites/${sitterId}`, {
          method: wasFavorited ? 'DELETE' : 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!res.ok) {
          throw new Error('Failed to toggle favorite');
        }

        // On add, refetch to get full sitter data
        if (!wasFavorited) {
          const listRes = await fetch(`${API_BASE}/favorites`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (listRes.ok) {
            const data = await listRes.json();
            setFavorites(data.favorites);
          }
        }
      } catch {
        // Rollback optimistic update
        setFavoritedIds((prev) => {
          const next = new Set(prev);
          if (wasFavorited) {
            next.add(sitterId);
          } else {
            next.delete(sitterId);
          }
          return next;
        });
      }
    },
    [token, favoritedIds]
  );

  const isFavorited = useCallback(
    (sitterId: number) => favoritedIds.has(sitterId),
    [favoritedIds]
  );

  return { favorites, favoritedIds, toggleFavorite, isFavorited, loading };
}
