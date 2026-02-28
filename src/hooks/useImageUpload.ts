import { useState, useCallback } from 'react';
import { getAuthHeaders } from '../context/AuthContext';
import { API_BASE } from '../config';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

interface UploadState {
  uploading: boolean;
  progress: number;
  error: string | null;
}

export function useImageUpload(token: string | null) {
  const [state, setState] = useState<UploadState>({
    uploading: false,
    progress: 0,
    error: null,
  });

  const upload = useCallback(
    async (file: File, folder: 'pets' | 'avatars' | 'verifications' | 'walks'): Promise<string | null> => {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setState((s) => ({ ...s, error: 'Please select a JPEG, PNG, WebP, or GIF image.' }));
        return null;
      }
      if (file.size > MAX_FILE_SIZE) {
        setState((s) => ({ ...s, error: 'File size must be under 5MB.' }));
        return null;
      }

      setState({ uploading: true, progress: 0, error: null });

      try {
        // Step 1: Get signed URL from backend
        const signedRes = await fetch(`${API_BASE}/uploads/signed-url`, {
          method: 'POST',
          headers: getAuthHeaders(token),
          body: JSON.stringify({ folder, contentType: file.type }),
        });

        if (!signedRes.ok) {
          const data = await signedRes.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to get upload URL');
        }

        const { uploadUrl, publicUrl } = await signedRes.json();
        setState((s) => ({ ...s, progress: 30 }));

        // Step 2: Upload directly to S3
        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file,
        });

        if (!uploadRes.ok) {
          throw new Error('Upload failed. Please try again.');
        }

        setState({ uploading: false, progress: 100, error: null });
        return publicUrl;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Upload failed. Please try again.';
        setState({ uploading: false, progress: 0, error: message });
        return null;
      }
    },
    [token],
  );

  const clearError = useCallback(() => {
    setState((s) => ({ ...s, error: null }));
  }, []);

  return { ...state, upload, clearError };
}
