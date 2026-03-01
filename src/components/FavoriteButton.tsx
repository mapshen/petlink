import React from 'react';
import { Heart } from 'lucide-react';

interface FavoriteButtonProps {
  sitterId: number;
  isFavorited: boolean;
  onToggle: (sitterId: number) => void;
  size?: 'sm' | 'md';
}

export default function FavoriteButton({ sitterId, isFavorited, onToggle, size = 'md' }: FavoriteButtonProps) {
  const iconSize = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  const padding = size === 'sm' ? 'p-1' : 'p-1.5';

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle(sitterId);
      }}
      aria-label={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
      className={`${padding} rounded-full transition-colors ${
        isFavorited
          ? 'text-red-500 hover:text-red-600'
          : 'text-stone-400 hover:text-red-400'
      }`}
    >
      <Heart
        className={`${iconSize} transition-all ${isFavorited ? 'fill-current' : ''}`}
      />
    </button>
  );
}
