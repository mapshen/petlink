import { useState, useCallback } from 'react';
import { getAuthHeaders } from '../context/AuthContext';
import { API_BASE } from '../config';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'];
const MAX_DURATION_SECONDS = 60;

interface UploadState {
  uploading: boolean;
  progress: number;
  error: string | null;
}

function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error('Failed to read video metadata'));
    };
    video.src = URL.createObjectURL(file);
  });
}

export function useVideoUpload(token: string | null) {
  const [state, setState] = useState<UploadState>({
    uploading: false,
    progress: 0,
    error: null,
  });

  const upload = useCallback(
    async (file: File): Promise<string | null> => {
      if (!ALLOWED_TYPES.includes(file.type)) {
        setState((s) => ({ ...s, error: 'Please select an MP4, MOV, or WebM video.' }));
        return null;
      }
      if (file.size > MAX_FILE_SIZE) {
        setState((s) => ({ ...s, error: 'Video file must be under 50MB.' }));
        return null;
      }

      // Check duration client-side
      try {
        const duration = await getVideoDuration(file);
        if (duration > MAX_DURATION_SECONDS) {
          setState((s) => ({ ...s, error: `Video must be ${MAX_DURATION_SECONDS} seconds or shorter.` }));
          return null;
        }
      } catch {
        setState((s) => ({ ...s, error: 'Could not read video metadata. Please try a different file.' }));
        return null;
      }

      setState({ uploading: true, progress: 0, error: null });

      try {
        // Step 1: Get signed URL from backend
        const signedRes = await fetch(`${API_BASE}/uploads/signed-url`, {
          method: 'POST',
          headers: getAuthHeaders(token),
          body: JSON.stringify({ folder: 'videos', contentType: file.type, fileSize: file.size }),
        });

        if (!signedRes.ok) {
          const data = await signedRes.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to get upload URL');
        }

        const { uploadUrl, publicUrl } = await signedRes.json();
        setState((s) => ({ ...s, progress: 20 }));

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
