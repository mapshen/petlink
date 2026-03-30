import { describe, it, expect } from 'vitest';
import { slugify } from './slugify.ts';

describe('slugify', () => {
  it('converts name to lowercase kebab-case', () => {
    expect(slugify('Bob Sitter')).toBe('bob-sitter');
  });

  it('removes apostrophes', () => {
    expect(slugify("O'Brien")).toBe('obrien');
  });

  it('replaces multiple spaces with single dash', () => {
    expect(slugify('Sarah  Jane  Martinez')).toBe('sarah-jane-martinez');
  });

  it('removes special characters', () => {
    expect(slugify('Bob (The Great) Sitter!')).toBe('bob-the-great-sitter');
  });

  it('trims leading/trailing dashes', () => {
    expect(slugify('  Bob Sitter  ')).toBe('bob-sitter');
  });

  it('handles empty string', () => {
    expect(slugify('')).toBe('');
  });

  it('handles unicode names', () => {
    expect(slugify('José García')).toBe('jos-garc-a');
  });
});
