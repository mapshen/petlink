import { describe, it, expect } from 'vitest';
import { getDisplayName } from './display-name';

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
