import { useState, useEffect } from 'react';
import { useAuth, getAuthHeaders } from '../context/AuthContext';
import { Service } from '../types';
import { API_BASE } from '../config';

export interface OnboardingStatus {
  hasProfile: boolean;
  hasServices: boolean;
  hasPhoto: boolean;
  hasVerification: boolean;
  isComplete: boolean;
  completedCount: number;
  loading: boolean;
  services: Service[];
}

export function computeOnboardingStatus(
  user: { bio?: string; avatar_url?: string } | null,
  services: Service[],
  hasVerification: boolean
): Omit<OnboardingStatus, 'loading' | 'services'> {
  const hasProfile = Boolean(user?.bio);
  const hasServices = services.length > 0;
  const hasPhoto = Boolean(user?.avatar_url);

  const completed = [hasProfile, hasServices, hasPhoto, hasVerification].filter(Boolean).length;

  return {
    hasProfile,
    hasServices,
    hasPhoto,
    hasVerification,
    isComplete: hasProfile && hasServices && hasPhoto && hasVerification,
    completedCount: completed,
  };
}

export function useOnboardingStatus(): OnboardingStatus {
  const { user, token } = useAuth();
  const [services, setServices] = useState<Service[]>([]);
  const [hasVerification, setHasVerification] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !token) {
      setLoading(false);
      return;
    }

    const isSitter = user.role === 'sitter' || user.role === 'both';
    if (!isSitter) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();

    Promise.all([
      fetch(`${API_BASE}/services/me`, {
        headers: getAuthHeaders(token),
        signal: controller.signal,
      }).then((r) => (r.ok ? r.json() : { services: [] })),
      fetch(`${API_BASE}/verification/me`, {
        headers: getAuthHeaders(token),
        signal: controller.signal,
      }).then((r) => (r.ok ? r.json() : { verification: null })),
    ])
      .then(([servicesData, verificationData]) => {
        setServices(servicesData.services || []);
        setHasVerification(Boolean(verificationData.verification));
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [user, token]);

  const derived = computeOnboardingStatus(user, services, hasVerification);

  return { ...derived, loading, services };
}
