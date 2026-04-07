import type { User, Service } from '../types';
import { getServiceLabel } from '../shared/service-labels';

const BIO_MAX_LENGTH = 80;

export interface CardData {
  readonly name: string;
  readonly avatarUrl: string | undefined;
  readonly tagline: string;
  readonly rating: number | null;
  readonly reviewCount: number;
  readonly serviceLabels: readonly string[];
}

/**
 * Build the sitter profile URL with referral tracking.
 * Uses slug if available, otherwise falls back to user ID.
 */
export function buildProfileUrl(
  slug: string | undefined,
  origin: string,
  refSource: string = 'qr',
  userId?: number,
): string {
  const cleanOrigin = origin.replace(/\/+$/, '');
  const identifier = slug ?? String(userId ?? '');
  return `${cleanOrigin}/sitters/${identifier}?ref=${refSource}`;
}

/**
 * Build display data for the QR business card from user + services.
 * Pure function -- no side effects.
 */
export function buildCardData(user: User, services: Service[]): CardData {
  const bio = user.bio ?? '';
  const tagline =
    bio.length > BIO_MAX_LENGTH ? `${bio.slice(0, BIO_MAX_LENGTH)}...` : bio;

  const serviceLabels = services.map((s) => getServiceLabel(s.type));

  return {
    name: user.name,
    avatarUrl: user.avatar_url,
    tagline,
    rating: user.avg_rating ?? null,
    reviewCount: user.review_count ?? 0,
    serviceLabels,
  };
}
