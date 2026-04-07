import { describe, it, expect } from 'vitest';
import { buildProfileUrl, buildCardData } from './qr-business-card';

describe('buildProfileUrl', () => {
  it('builds URL with slug and ref param', () => {
    const url = buildProfileUrl('jane-doe', 'https://petlink.com');
    expect(url).toBe('https://petlink.com/sitters/jane-doe?ref=qr');
  });

  it('trims trailing slash from origin', () => {
    const url = buildProfileUrl('bob-smith', 'https://petlink.com/');
    expect(url).toBe('https://petlink.com/sitters/bob-smith?ref=qr');
  });

  it('uses custom ref source when provided', () => {
    const url = buildProfileUrl('jane-doe', 'https://petlink.com', 'card');
    expect(url).toBe('https://petlink.com/sitters/jane-doe?ref=card');
  });

  it('falls back to user ID when slug is undefined', () => {
    const url = buildProfileUrl(undefined, 'https://petlink.com', 'qr', 42);
    expect(url).toBe('https://petlink.com/sitters/42?ref=qr');
  });
});

describe('buildCardData', () => {
  const baseUser = {
    id: 1,
    name: 'Jane Doe',
    email: 'jane@example.com',
    roles: ['owner', 'sitter'],
    slug: 'jane-doe',
    bio: 'I love all animals and have 10 years of experience caring for pets of all sizes.',
    avatar_url: 'https://example.com/avatar.jpg',
    avg_rating: 4.8,
    review_count: 42,
  } as any;

  const services = [
    { id: 1, sitter_id: 1, type: 'walking', price_cents: 2500 },
    { id: 2, sitter_id: 1, type: 'sitting', price_cents: 5000 },
  ] as any[];

  it('builds card data from user and services', () => {
    const data = buildCardData(baseUser, services);
    expect(data.name).toBe('Jane Doe');
    expect(data.avatarUrl).toBe('https://example.com/avatar.jpg');
    expect(data.rating).toBe(4.8);
    expect(data.reviewCount).toBe(42);
    expect(data.serviceLabels).toEqual(['Walking', 'House Sitting']);
  });

  it('truncates long bio to max length', () => {
    const longBio = 'A'.repeat(200);
    const user = { ...baseUser, bio: longBio };
    const data = buildCardData(user, services);
    expect(data.tagline.length).toBeLessThanOrEqual(83); // 80 + '...'
  });

  it('uses short bio as-is', () => {
    const user = { ...baseUser, bio: 'Short bio' };
    const data = buildCardData(user, services);
    expect(data.tagline).toBe('Short bio');
  });

  it('returns empty tagline when no bio', () => {
    const user = { ...baseUser, bio: undefined };
    const data = buildCardData(user, services);
    expect(data.tagline).toBe('');
  });

  it('returns empty serviceLabels when no services', () => {
    const data = buildCardData(baseUser, []);
    expect(data.serviceLabels).toEqual([]);
  });

  it('handles null avg_rating', () => {
    const user = { ...baseUser, avg_rating: null };
    const data = buildCardData(user, services);
    expect(data.rating).toBeNull();
  });

  it('defaults reviewCount to 0', () => {
    const user = { ...baseUser, review_count: undefined };
    const data = buildCardData(user, services);
    expect(data.reviewCount).toBe(0);
  });
});
