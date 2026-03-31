import { useState, useRef } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { useImageUpload } from '../../hooks/useImageUpload';
import { API_BASE } from '../../config';
import { Button } from '../ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogCancel,
} from '../ui/alert-dialog';

const MAX_CAPTION_LENGTH = 2000;

interface PostInput {
  content?: string;
  photoUrl?: string;
  videoUrl?: string;
}

export function validatePostContent(input: PostInput): string | null {
  const hasContent = input.content && input.content.trim().length > 0;
  const hasMedia = input.photoUrl || input.videoUrl;
  if (!hasContent && !hasMedia) return 'Post must have text, a photo, or a video';
  if (input.content && input.content.length > MAX_CAPTION_LENGTH) return 'Caption must be under 2000 characters';
  return null;
}

interface Props {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onPostCreated: () => void;
}

export default function CreatePostDialog({ open, onOpenChange, onPostCreated }: Props) {
  const { token } = useAuth();
  const { uploading, upload } = useImageUpload(token);
  const [content, setContent] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setContent('');
    setPhotoUrl(null);
    setPhotoPreview(null);
    setError(null);
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show preview immediately
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);

    // Upload
    const url = await upload(file, 'posts');
    if (url) {
      setPhotoUrl(url);
    } else {
      setPhotoPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setError('Failed to upload photo');
    }
  };

  const handleRemovePhoto = () => {
    setPhotoUrl(null);
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async () => {
    const validation = validatePostContent({ content: content || undefined, photoUrl: photoUrl || undefined });
    if (validation) {
      setError(validation);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const body: Record<string, string> = { post_type: 'update' };
      if (content.trim()) body.content = content.trim();
      if (photoUrl) body.photo_url = photoUrl;

      const res = await fetch(`${API_BASE}/sitter-posts`, {
        method: 'POST',
        headers: getAuthHeaders(token),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create post');
      }

      resetForm();
      onOpenChange(false);
      onPostCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create post');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(isOpen) => { if (!isOpen) { resetForm(); onOpenChange(false); } }}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>Create Post</AlertDialogTitle>
        </AlertDialogHeader>

        <div className="space-y-4">
          {/* Caption */}
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What's happening with your furry friends?"
            className="w-full border border-stone-200 rounded-xl p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            rows={3}
            maxLength={MAX_CAPTION_LENGTH}
          />
          <div className="text-xs text-stone-400 text-right">{content.length}/{MAX_CAPTION_LENGTH}</div>

          {/* Photo preview */}
          {photoPreview && (
            <div className="relative">
              <img src={photoPreview} alt="Preview" className="w-full rounded-xl object-cover max-h-48" />
              <button
                onClick={handleRemovePhoto}
                className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1 hover:bg-black/70"
                aria-label="Remove photo"
              >
                <X className="w-4 h-4" />
              </button>
              {uploading && (
                <div className="absolute inset-0 bg-black/30 rounded-xl flex items-center justify-center">
                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                </div>
              )}
            </div>
          )}

          {/* Media buttons */}
          {!photoPreview && (
            <div className="flex gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 text-sm text-stone-600 border border-stone-200 rounded-lg px-3 py-2 hover:bg-stone-50 transition-colors disabled:opacity-50"
              >
                <ImagePlus className="w-4 h-4" />
                Add Photo
              </button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handlePhotoSelect}
            className="hidden"
          />

          {error && (
            <p className="text-sm text-red-600" role="alert">{error}</p>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => { resetForm(); onOpenChange(false); }}>
            Cancel
          </AlertDialogCancel>
          <Button
            onClick={handleSubmit}
            disabled={submitting || uploading}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Posting...
              </>
            ) : (
              'Post'
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
