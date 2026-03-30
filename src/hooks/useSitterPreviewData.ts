import { useState, useEffect } from 'react';
import { useAuth, getAuthHeaders } from '../context/AuthContext';
import { API_BASE } from '../config';

interface Service {
  id: number;
  type: string;
  price: number;
  description?: string;
}

interface SitterPhoto {
  id: number;
  photo_url: string;
}

export function useSitterPreviewData() {
  const { user, token } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [photos, setPhotos] = useState<SitterPhoto[]>([]);

  useEffect(() => {
    if (!user || !token) return;

    const isSitter = user.roles?.includes('sitter') ?? false;
    if (!isSitter) return;

    const controller = new AbortController();
    const headers = getAuthHeaders(token);
    const opts = { headers, signal: controller.signal };

    Promise.all([
      fetch(`${API_BASE}/services/me`, opts).then((r) => (r.ok ? r.json() : { services: [] })),
      fetch(`${API_BASE}/sitter-photos/${user.id}`, opts).then((r) => (r.ok ? r.json() : { photos: [] })),
    ])
      .then(([svcData, photoData]) => {
        if (controller.signal.aborted) return;
        setServices(svcData.services || []);
        setPhotos(photoData.photos || []);
      })
      .catch(() => {});

    return () => controller.abort();
  }, [user, token]);

  return { services, photos };
}
