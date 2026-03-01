import React, { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { SitterPhoto } from '../types';

interface PhotoGalleryProps {
  photos: SitterPhoto[];
}

export default function PhotoGallery({ photos }: PhotoGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const goNext = useCallback(() => {
    setSelectedIndex((prev) => prev === null ? null : (prev + 1) % photos.length);
  }, [photos.length]);

  const goPrev = useCallback(() => {
    setSelectedIndex((prev) => prev === null ? null : (prev - 1 + photos.length) % photos.length);
  }, [photos.length]);

  const close = useCallback(() => setSelectedIndex(null), []);

  // Keyboard navigation
  useEffect(() => {
    if (selectedIndex === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIndex, goNext, goPrev, close]);

  if (photos.length === 0) return null;

  return (
    <>
      {/* Thumbnail Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {photos.map((photo, i) => (
          <button
            key={photo.id}
            onClick={() => setSelectedIndex(i)}
            aria-label={photo.caption || `View photo ${i + 1}`}
            className="aspect-square rounded-xl overflow-hidden border border-stone-100 hover:ring-2 hover:ring-emerald-400 transition-all"
          >
            <img
              src={photo.photo_url}
              alt={photo.caption || `Photo ${i + 1}`}
              className="w-full h-full object-cover"
            />
          </button>
        ))}
      </div>

      {/* Lightbox Modal */}
      {selectedIndex !== null && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Photo viewer"
          onClick={close}
        >
          <div
            className="relative max-w-3xl w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={close}
              aria-label="Close photo viewer"
              className="absolute -top-10 right-0 text-white/80 hover:text-white p-1"
            >
              <X className="w-6 h-6" />
            </button>

            <img
              src={photos[selectedIndex].photo_url}
              alt={photos[selectedIndex].caption || ''}
              className="w-full rounded-xl object-contain max-h-[80vh]"
            />

            {photos[selectedIndex].caption && (
              <p className="text-white/80 text-sm text-center mt-3">
                {photos[selectedIndex].caption}
              </p>
            )}

            {photos.length > 1 && (
              <>
                <button
                  onClick={goPrev}
                  aria-label="Previous photo"
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-2 hover:bg-black/70 transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={goNext}
                  aria-label="Next photo"
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-2 hover:bg-black/70 transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}

            <div className="flex justify-center gap-1.5 mt-3">
              {photos.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedIndex(i)}
                  aria-label={`View photo ${i + 1}`}
                  className={`w-2 h-2 rounded-full transition-colors ${
                    i === selectedIndex ? 'bg-white' : 'bg-white/40'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
