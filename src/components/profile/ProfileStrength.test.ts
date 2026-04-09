import { describe, it, expect } from 'vitest';
import { computeStrength } from './ProfileStrength';

const baseUser = {
  id: 1,
  email: 'bob@example.com',
  name: 'Bob',
  roles: ['owner', 'sitter'],
} as any;

describe('computeStrength', () => {
  it('returns 0 completed for empty profile', () => {
    const { completed, total } = computeStrength(baseUser, [], []);
    expect(completed).toBe(0);
    expect(total).toBe(6);
  });

  it('counts avatar as done', () => {
    const user = { ...baseUser, avatar_url: 'https://example.com/pic.jpg' };
    const { items } = computeStrength(user, [], []);
    expect(items.find((i) => i.label === 'Upload avatar')?.done).toBe(true);
  });

  it('counts bio as done', () => {
    const user = { ...baseUser, bio: 'Hi there' };
    const { items } = computeStrength(user, [], []);
    expect(items.find((i) => i.label === 'Write bio')?.done).toBe(true);
  });

  it('counts services as done when at least one exists', () => {
    const services = [{ id: 1, sitter_id: 1, type: 'walking' as const, price_cents: 2500 }];
    const { items } = computeStrength(baseUser, services, []);
    expect(items.find((i) => i.label === 'Add services')?.done).toBe(true);
  });

  it('counts location as done when lat/lng set', () => {
    const user = { ...baseUser, lat: 40.7, lng: -74.0 };
    const { items } = computeStrength(user, [], []);
    expect(items.find((i) => i.label === 'Set location')?.done).toBe(true);
  });

  it('counts photos as done when at least one exists', () => {
    const photos = [{ id: 1, sitter_id: 1, photo_url: 'https://example.com', caption: '', sort_order: 0, created_at: '' }];
    const { items } = computeStrength(baseUser, [], photos);
    expect(items.find((i) => i.label === 'Upload photos')?.done).toBe(true);
  });

  it('counts accepted species as done', () => {
    const user = { ...baseUser, accepted_species: ['dog', 'cat'] };
    const { items } = computeStrength(user, [], []);
    expect(items.find((i) => i.label.includes('pet types'))?.done).toBe(true);
  });

  it('calculates fraction correctly for full profile', () => {
    const user = { ...baseUser, avatar_url: 'pic.jpg', bio: 'Hi', lat: 40.7, lng: -74.0, accepted_species: ['dog'] };
    const services = [{ id: 1, sitter_id: 1, type: 'walking' as const, price_cents: 2500 }];
    const photos = [{ id: 1, sitter_id: 1, photo_url: 'url', caption: '', sort_order: 0, created_at: '' }];
    const { completed, total } = computeStrength(user, services, photos);
    expect(completed).toBe(6);
    expect(total).toBe(6);
  });

  it('each item has an href for navigation', () => {
    const { items } = computeStrength(baseUser, [], []);
    for (const item of items) {
      expect(item.href).toMatch(/^#section-/);
    }
  });
});
