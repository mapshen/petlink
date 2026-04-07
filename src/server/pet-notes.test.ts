import { describe, it, expect } from 'vitest';
import { privatePetNoteSchema, updatePetNoteSchema } from './validation.ts';

describe('privatePetNoteSchema validation', () => {
  it('accepts valid note with content and flags', () => {
    const result = privatePetNoteSchema.safeParse({
      content: 'Dog was aggressive toward other animals',
      flags: ['aggressive'],
      booking_id: 42,
    });
    expect(result.success).toBe(true);
  });

  it('accepts note with no flags (empty array)', () => {
    const result = privatePetNoteSchema.safeParse({
      content: 'Pet was fine, nothing notable',
      flags: [],
      booking_id: 42,
    });
    expect(result.success).toBe(true);
  });

  it('accepts note with multiple flags', () => {
    const result = privatePetNoteSchema.safeParse({
      content: 'Multiple concerns',
      flags: ['aggressive', 'special_needs_undisclosed', 'medical_condition'],
      booking_id: 42,
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty content', () => {
    const result = privatePetNoteSchema.safeParse({
      content: '',
      flags: [],
      booking_id: 42,
    });
    expect(result.success).toBe(false);
  });

  it('rejects content over 2000 characters', () => {
    const result = privatePetNoteSchema.safeParse({
      content: 'x'.repeat(2001),
      flags: [],
      booking_id: 42,
    });
    expect(result.success).toBe(false);
  });

  it('accepts content at exactly 2000 characters', () => {
    const result = privatePetNoteSchema.safeParse({
      content: 'x'.repeat(2000),
      flags: [],
      booking_id: 42,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid flag values', () => {
    const result = privatePetNoteSchema.safeParse({
      content: 'test',
      flags: ['unknown_flag'],
      booking_id: 42,
    });
    expect(result.success).toBe(false);
  });

  it('rejects more than 4 flags', () => {
    const result = privatePetNoteSchema.safeParse({
      content: 'test',
      flags: ['aggressive', 'special_needs_undisclosed', 'medical_condition', 'other', 'other'],
      booking_id: 42,
    });
    expect(result.success).toBe(false);
  });

  it('rejects duplicate flags', () => {
    const result = privatePetNoteSchema.safeParse({
      content: 'test',
      flags: ['aggressive', 'aggressive'],
      booking_id: 42,
    });
    expect(result.success).toBe(false);
  });

  it('requires booking_id', () => {
    const result = privatePetNoteSchema.safeParse({
      content: 'test',
      flags: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer booking_id', () => {
    const result = privatePetNoteSchema.safeParse({
      content: 'test',
      flags: [],
      booking_id: 1.5,
    });
    expect(result.success).toBe(false);
  });
});

describe('updatePetNoteSchema validation', () => {
  it('accepts valid content and flags', () => {
    const result = updatePetNoteSchema.safeParse({
      content: 'Updated note',
      flags: ['medical_condition'],
    });
    expect(result.success).toBe(true);
  });

  it('does not require booking_id', () => {
    const result = updatePetNoteSchema.safeParse({
      content: 'Updated note',
      flags: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty content', () => {
    const result = updatePetNoteSchema.safeParse({
      content: '',
      flags: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects duplicate flags', () => {
    const result = updatePetNoteSchema.safeParse({
      content: 'test',
      flags: ['aggressive', 'aggressive'],
    });
    expect(result.success).toBe(false);
  });
});

describe('pet note flag categories', () => {
  it('all 4 valid flags are accepted individually', () => {
    const validFlags = ['aggressive', 'special_needs_undisclosed', 'medical_condition', 'other'];
    for (const flag of validFlags) {
      const result = privatePetNoteSchema.safeParse({
        content: 'test',
        flags: [flag],
        booking_id: 1,
      });
      expect(result.success).toBe(true);
    }
  });
});
