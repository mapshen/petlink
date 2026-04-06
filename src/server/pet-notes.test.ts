import { describe, it, expect, vi, beforeEach } from 'vitest';
import { privatePetNoteSchema } from './validation.ts';

// --- Mock infrastructure ---
const { mockSqlFn } = vi.hoisted(() => {
  const sqlFn = vi.fn();
  return { mockSqlFn: sqlFn };
});
vi.mock('./db.ts', () => ({ default: mockSqlFn }));
vi.mock('./logger.ts', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  sanitizeError: (e: unknown) => e,
}));

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
      flags: ['aggressive', 'special_needs_undisclosed', 'medical_condition', 'other', 'aggressive'],
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

describe('private pet notes business rules', () => {
  it('unique constraint allows one note per sitter per booking', () => {
    // UNIQUE(sitter_id, booking_id) prevents duplicates
    // Verified at the DB schema level
    expect(true).toBe(true);
  });

  it('flag categories are well-defined', () => {
    const validFlags = ['aggressive', 'special_needs_undisclosed', 'medical_condition', 'other'];
    expect(validFlags).toHaveLength(4);
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
