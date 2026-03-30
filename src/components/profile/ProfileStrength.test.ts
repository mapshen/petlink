import { describe, it, expect } from 'vitest';
import { computeStrength } from './ProfileStrength';

const baseUser = {
  id: 1,
  email: 'bob@example.com',
  name: 'Bob',
  roles: ['owner', 'sitter'],
} as any;

describe('computeStrength', () => {
  it('returns 0% for empty profile', () => {
    const { percentage } = computeStrength(baseUser, [], []);
    expect(percentage).toBe(0);
  });

  it('counts bio + avatar as one item', () => {
    const user = { ...baseUser, bio: 'Hi', avatar_url: 'https://example.com/pic.jpg' };
    const { items } = computeStrength(user, [], []);
    expect(items.find((i) => i.label.includes('bio'))?.done).toBe(true);
  });

  it('requires both bio and avatar for that item', () => {
    const userBioOnly = { ...baseUser, bio: 'Hi' };
    const { items } = computeStrength(userBioOnly, [], []);
    expect(items.find((i) => i.label.includes('bio'))?.done).toBe(false);
  });

  it('counts services as done when at least one exists', () => {
    const services = [{ id: 1, sitter_id: 1, type: 'walking' as const, price: 25 }];
    const { items } = computeStrength(baseUser, services, []);
    expect(items.find((i) => i.label.includes('services'))?.done).toBe(true);
  });

  it('counts photos as done when at least one exists', () => {
    const photos = [{ id: 1, sitter_id: 1, photo_url: 'https://example.com', caption: '', sort_order: 0, created_at: '' }];
    const { items } = computeStrength(baseUser, [], photos);
    expect(items.find((i) => i.label.includes('photos'))?.done).toBe(true);
  });

  it('counts accepted species as done', () => {
    const user = { ...baseUser, accepted_species: ['dog', 'cat'] };
    const { items } = computeStrength(user, [], []);
    expect(items.find((i) => i.label.includes('pet types'))?.done).toBe(true);
  });

  it('counts policies as done when house_rules set', () => {
    const user = { ...baseUser, house_rules: 'No aggressive dogs' };
    const { items } = computeStrength(user, [], []);
    expect(items.find((i) => i.label.includes('policies'))?.done).toBe(true);
  });

  it('calculates percentage correctly', () => {
    const user = { ...baseUser, bio: 'Hi', avatar_url: 'pic.jpg', accepted_species: ['dog'], house_rules: 'Rules' };
    const services = [{ id: 1, sitter_id: 1, type: 'walking' as const, price: 25 }];
    const photos = [{ id: 1, sitter_id: 1, photo_url: 'url', caption: '', sort_order: 0, created_at: '' }];
    const { percentage } = computeStrength(user, services, photos);
    // 5 out of 7 items done (bio+avatar, services, photos, species, policies)
    expect(percentage).toBe(71);
  });
});
