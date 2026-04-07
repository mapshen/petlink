import { describe, it, expect } from 'vitest';
import { buildProfileUrl, buildCardData } from '../../lib/qr-business-card';

/**
 * QRBusinessCard component tests.
 *
 * The React component itself is tested indirectly through the pure logic
 * functions it depends on (buildProfileUrl, buildCardData). DOM rendering
 * tests require jsdom + qrcode.react which adds test complexity for minimal
 * coverage gain -- the component is primarily a visual template.
 *
 * These tests verify the data transformation layer that feeds the component.
 */

const sitterUser = {
  id: 5,
  name: 'Sarah Connor',
  email: 'sarah@example.com',
  roles: ['owner', 'sitter'],
  slug: 'sarah-connor',
  bio: 'Experienced pet sitter who loves caring for furry friends. Available weekdays.',
  avatar_url: 'https://cdn.example.com/sarah.jpg',
  avg_rating: 4.9,
  review_count: 87,
} as any;

const services = [
  { id: 1, sitter_id: 5, type: 'walking', price_cents: 3000 },
  { id: 2, sitter_id: 5, type: 'sitting', price_cents: 6000 },
  { id: 3, sitter_id: 5, type: 'daycare', price_cents: 4500 },
] as any[];

describe('QRBusinessCard data pipeline', () => {
  it('builds profile URL with slug and qr ref', () => {
    const url = buildProfileUrl(sitterUser.slug, 'https://petlink.com');
    expect(url).toBe('https://petlink.com/sitters/sarah-connor?ref=qr');
  });

  it('card data reflects sitter info accurately', () => {
    const data = buildCardData(sitterUser, services);
    expect(data.name).toBe('Sarah Connor');
    expect(data.avatarUrl).toBe('https://cdn.example.com/sarah.jpg');
    expect(data.rating).toBe(4.9);
    expect(data.reviewCount).toBe(87);
    expect(data.serviceLabels).toHaveLength(3);
    expect(data.serviceLabels).toContain('Walking');
    expect(data.serviceLabels).toContain('House Sitting');
    expect(data.serviceLabels).toContain('Daycare');
  });

  it('handles sitter with no rating or reviews', () => {
    const newSitter = { ...sitterUser, avg_rating: null, review_count: 0 };
    const data = buildCardData(newSitter, []);
    expect(data.rating).toBeNull();
    expect(data.reviewCount).toBe(0);
    expect(data.serviceLabels).toEqual([]);
  });

  it('url falls back to ID when slug missing', () => {
    const url = buildProfileUrl(undefined, 'https://petlink.com', 'qr', 5);
    expect(url).toBe('https://petlink.com/sitters/5?ref=qr');
  });

  it('truncates long bio for tagline', () => {
    const longBioSitter = {
      ...sitterUser,
      bio: 'I have been caring for dogs and cats for over twenty years in the San Francisco Bay Area. My home has a large fenced backyard.',
    };
    const data = buildCardData(longBioSitter, services);
    expect(data.tagline).toMatch(/\.\.\.$/);
    expect(data.tagline.length).toBeLessThanOrEqual(83);
  });

  it('preserves short bio without truncation', () => {
    const shortBioSitter = { ...sitterUser, bio: 'Pet lover' };
    const data = buildCardData(shortBioSitter, services);
    expect(data.tagline).toBe('Pet lover');
  });
});
