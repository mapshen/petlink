import { describe, it, expect } from 'vitest';
import { getDisplayName, buildCombinedName } from './display-name';

describe('getDisplayName', () => {
  it('returns first name + last initial with period', () => {
    expect(getDisplayName('Michael Henderson')).toBe('Michael H.');
  });

  it('handles single name (no last name)', () => {
    expect(getDisplayName('Sarah')).toBe('Sarah');
  });

  it('drops middle name — first name + last initial only', () => {
    expect(getDisplayName('Sarah Jane Martinez')).toBe('Sarah M.');
  });

  it('handles couple names with ampersand', () => {
    expect(getDisplayName('Michael & Sarah Henderson')).toBe('Michael & Sarah H.');
  });

  it('handles couple names with "and"', () => {
    expect(getDisplayName('Michael and Sarah Henderson')).toBe('Michael and Sarah H.');
  });

  it('handles empty string', () => {
    expect(getDisplayName('')).toBe('');
  });

  it('handles whitespace-only', () => {
    expect(getDisplayName('   ')).toBe('');
  });

  it('trims whitespace', () => {
    expect(getDisplayName('  Bob Smith  ')).toBe('Bob S.');
  });

  it('handles hyphenated last names', () => {
    expect(getDisplayName('Lisa Park-Kim')).toBe('Lisa P.');
  });
});

describe('buildCombinedName', () => {
  it('returns primary name when no members', () => {
    expect(buildCombinedName('Michael Henderson', [])).toBe('Michael Henderson');
  });

  it('combines primary + one member first name', () => {
    expect(buildCombinedName('Michael Henderson', [{ name: 'Sarah' }])).toBe('Michael & Sarah Henderson');
  });

  it('uses only first name from member full name', () => {
    expect(buildCombinedName('Michael Henderson', [{ name: 'Sarah Jones' }])).toBe('Michael & Sarah Henderson');
  });

  it('handles single-name primary', () => {
    expect(buildCombinedName('Michael', [{ name: 'Sarah' }])).toBe('Michael & Sarah');
  });

  it('handles empty members array', () => {
    expect(buildCombinedName('Michael Henderson', [])).toBe('Michael Henderson');
  });

  it('works with getDisplayName for full privacy flow', () => {
    const combined = buildCombinedName('Michael Henderson', [{ name: 'Sarah' }]);
    expect(getDisplayName(combined)).toBe('Michael & Sarah H.');
  });
});
