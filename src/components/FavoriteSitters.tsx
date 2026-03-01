import React from 'react';
import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import FavoriteButton from './FavoriteButton';

interface FavoriteSitter {
  id: number;
  sitter_id: number;
  sitter_name: string;
  sitter_avatar: string | null;
  sitter_bio: string | null;
}

interface FavoriteSittersProps {
  favorites: FavoriteSitter[];
  onToggle: (sitterId: number) => void;
}

export default function FavoriteSitters({ favorites, onToggle }: FavoriteSittersProps) {
  if (favorites.length === 0) return null;

  return (
    <div>
      <h2 className="text-lg font-semibold text-stone-800 mb-3 flex items-center gap-2">
        <Heart className="w-5 h-5 text-red-500 fill-current" />
        Favorite Sitters
      </h2>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
        {favorites.map((fav) => (
          <Link
            key={fav.id}
            to={`/sitter/${fav.sitter_id}`}
            className="flex-shrink-0 w-36 bg-white rounded-2xl shadow-sm border border-stone-100 p-3 hover:shadow-md transition-shadow"
          >
            <div className="relative">
              <img
                src={fav.sitter_avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(fav.sitter_name)}&background=d1fae5&color=065f46`}
                alt={fav.sitter_name}
                className="w-16 h-16 rounded-full mx-auto object-cover"
              />
              <div className="absolute -top-1 -right-1">
                <FavoriteButton
                  sitterId={fav.sitter_id}
                  isFavorited={true}
                  onToggle={onToggle}
                  size="sm"
                />
              </div>
            </div>
            <p className="text-sm font-medium text-stone-800 text-center mt-2 truncate">
              {fav.sitter_name}
            </p>
            {fav.sitter_bio && (
              <p className="text-xs text-stone-500 text-center mt-0.5 line-clamp-2">
                {fav.sitter_bio}
              </p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
