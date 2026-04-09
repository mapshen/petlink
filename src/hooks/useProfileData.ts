import { useState, useEffect } from 'react';
import { useAuth, getAuthHeaders } from '../context/AuthContext';
import { API_BASE } from '../config';
import type { ProfileType, Pet } from '../types';

export interface OwnerReview {
  id: number;
  rating: number;
  comment?: string;
  created_at: string;
  reviewer_name: string;
  reviewer_avatar?: string;
}

export interface OwnerProfileData {
  owner: {
    id: number;
    name: string;
    slug: string;
    avatar_url?: string;
    bio?: string;
    created_at: string;
    completed_bookings?: number;
    avg_rating?: number | null;
    review_count?: number;
    cancellation_rate?: number;
  };
  pets: Pet[];
  reviews: OwnerReview[];
  isOwner: boolean;
}

export interface PetProfileData {
  pet: {
    id: number;
    name: string;
    slug: string;
    species: string;
    breed?: string;
    age?: number;
    weight?: number;
    gender?: string;
    spayed_neutered?: boolean;
    energy_level?: string;
    house_trained?: boolean;
    temperament?: string[];
    special_needs?: string;
    photo_url?: string;
  };
  owner: {
    id: number;
    name: string;
    slug: string;
    avatar_url?: string;
  } | null;
  isOwner: boolean;
}

type ProfileData = OwnerProfileData | PetProfileData;

interface UseProfileDataResult {
  data: ProfileData | null;
  loading: boolean;
  error: string | null;
  isOwner: boolean;
}

export function useProfileData(profileType: ProfileType, slug: string): UseProfileDataResult {
  const { token } = useAuth();
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug || !token) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchProfile() {
      setLoading(true);
      setError(null);

      const endpoint =
        profileType === 'owner'
          ? `${API_BASE}/owners/by-slug/${slug}`
          : profileType === 'pet'
            ? `${API_BASE}/pets/by-slug/${slug}`
            : null;

      if (!endpoint) {
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(endpoint, { headers: getAuthHeaders(token) });
        if (!res.ok) {
          if (res.status === 404) {
            setError('Not found');
          } else {
            setError('Failed to load profile');
          }
          setLoading(false);
          return;
        }
        const json = await res.json();
        if (!cancelled) {
          setData(json);
        }
      } catch {
        if (!cancelled) {
          setError('Failed to load profile');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchProfile();
    return () => { cancelled = true; };
  }, [profileType, slug, token]);

  const isOwner = data ? ('isOwner' in data ? data.isOwner : false) : false;

  return { data, loading, error, isOwner };
}
