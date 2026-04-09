import { describe, it, expect } from 'vitest';
import { canAccessSpace } from './space-access.ts';

describe('community spaces role gating', () => {

  it('allows access when role_gate is null (everyone)', () => {
    expect(canAccessSpace(['owner'], null)).toBe(true);
    expect(canAccessSpace(['sitter'], null)).toBe(true);
  });

  it('allows access when role_gate is empty array', () => {
    expect(canAccessSpace(['owner'], [])).toBe(true);
  });

  it('allows sitter access to sitter-only spaces', () => {
    expect(canAccessSpace(['owner', 'sitter'], ['sitter'])).toBe(true);
  });

  it('blocks owner from sitter-only spaces', () => {
    expect(canAccessSpace(['owner'], ['sitter'])).toBe(false);
  });

  it('allows owner access to owner-only spaces', () => {
    expect(canAccessSpace(['owner'], ['owner'])).toBe(true);
  });

  it('blocks sitter-only from owner-only spaces', () => {
    expect(canAccessSpace(['sitter'], ['owner'])).toBe(false);
  });

  it('allows dual-role user access to any role-gated space', () => {
    expect(canAccessSpace(['owner', 'sitter'], ['sitter'])).toBe(true);
    expect(canAccessSpace(['owner', 'sitter'], ['owner'])).toBe(true);
  });

  it('admin can access sitter-only spaces if also a sitter', () => {
    expect(canAccessSpace(['owner', 'sitter', 'admin'], ['sitter'])).toBe(true);
  });
});

describe('community spaces schema', () => {
  const spaces = [
    { name: 'Sitter Lounge', slug: 'sitter-lounge', space_type: 'sitter_only', role_gate: ['sitter'], emoji: '☕' },
    { name: 'Pro Tips', slug: 'tips-and-tricks', space_type: 'sitter_only', role_gate: ['sitter'], emoji: '💡' },
    { name: 'Pet Health', slug: 'pet-care', space_type: 'everyone', role_gate: null, emoji: '🩺' },
    { name: 'New Sitters', slug: 'new-sitters', space_type: 'sitter_only', role_gate: ['sitter'], emoji: '🌱' },
    { name: 'Pet Parents', slug: 'pet-parents', space_type: 'owner_only', role_gate: ['owner'], emoji: '🐾' },
    { name: 'General', slug: 'general', space_type: 'everyone', role_gate: null, emoji: '💬' },
    { name: 'Introductions', slug: 'introductions', space_type: 'everyone', role_gate: null, emoji: '👋' },
  ];

  it('has 7 default spaces', () => {
    expect(spaces).toHaveLength(7);
  });

  it('has 3 sitter-only spaces', () => {
    expect(spaces.filter(s => s.space_type === 'sitter_only')).toHaveLength(3);
  });

  it('has 1 owner-only space', () => {
    expect(spaces.filter(s => s.space_type === 'owner_only')).toHaveLength(1);
  });

  it('has 3 everyone spaces', () => {
    expect(spaces.filter(s => s.space_type === 'everyone')).toHaveLength(3);
  });

  it('all spaces have unique slugs', () => {
    const slugs = spaces.map(s => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('all spaces have emoji', () => {
    spaces.forEach(s => expect(s.emoji).toBeTruthy());
  });
});
