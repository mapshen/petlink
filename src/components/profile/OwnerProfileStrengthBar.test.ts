import { describe, it, expect } from 'vitest';
import { computeOwnerStrength } from './OwnerProfileStrengthBar';

const baseOwner = {
  id: 1,
  name: 'Jessica R.',
  slug: 'jessica-r',
  created_at: '2025-01-15T00:00:00Z',
} as any;

describe('OwnerProfileStrengthBar', () => {
  it('returns 0/3 for empty owner profile', () => {
    const { completed, total } = computeOwnerStrength(baseOwner, []);
    expect(completed).toBe(0);
    expect(total).toBe(3);
  });

  it('counts avatar as done when present', () => {
    const owner = { ...baseOwner, avatar_url: 'https://example.com/avatar.jpg' };
    const { items } = computeOwnerStrength(owner, []);
    const avatarItem = items.find(i => i.label === 'Upload avatar');
    expect(avatarItem?.done).toBe(true);
  });

  it('counts avatar as incomplete when missing', () => {
    const { items } = computeOwnerStrength(baseOwner, []);
    const avatarItem = items.find(i => i.label === 'Upload avatar');
    expect(avatarItem?.done).toBe(false);
  });

  it('counts bio as done when present', () => {
    const owner = { ...baseOwner, bio: 'Dog mom to two rescue pups.' };
    const { items } = computeOwnerStrength(owner, []);
    const bioItem = items.find(i => i.label === 'Write bio');
    expect(bioItem?.done).toBe(true);
  });

  it('counts bio as incomplete when missing', () => {
    const { items } = computeOwnerStrength(baseOwner, []);
    const bioItem = items.find(i => i.label === 'Write bio');
    expect(bioItem?.done).toBe(false);
  });

  it('counts pet as done when pets array is non-empty', () => {
    const pets = [{ id: 1, owner_id: 1, name: 'Barkley', species: 'dog' }] as any;
    const { items } = computeOwnerStrength(baseOwner, pets);
    const petItem = items.find(i => i.label === 'Add a pet');
    expect(petItem?.done).toBe(true);
  });

  it('counts pet as incomplete when pets array is empty', () => {
    const { items } = computeOwnerStrength(baseOwner, []);
    const petItem = items.find(i => i.label === 'Add a pet');
    expect(petItem?.done).toBe(false);
  });

  it('returns 3/3 when all items complete', () => {
    const owner = { ...baseOwner, avatar_url: 'https://example.com/a.jpg', bio: 'Hello' };
    const pets = [{ id: 1, owner_id: 1, name: 'Luna', species: 'cat' }] as any;
    const { completed, total } = computeOwnerStrength(owner, pets);
    expect(completed).toBe(3);
    expect(total).toBe(3);
  });

  it('maps avatar and bio to header section', () => {
    const { items } = computeOwnerStrength(baseOwner, []);
    expect(items.find(i => i.label === 'Upload avatar')?.sectionId).toBe('header');
    expect(items.find(i => i.label === 'Write bio')?.sectionId).toBe('header');
  });

  it('maps pet to pets section', () => {
    const { items } = computeOwnerStrength(baseOwner, []);
    expect(items.find(i => i.label === 'Add a pet')?.sectionId).toBe('pets');
  });
});
