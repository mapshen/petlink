import { describe, it, expect } from 'vitest';
import { computeOnboardingStatus } from './useOnboardingStatus';
import { Service } from '../types';

const makeService = (overrides?: Partial<Service>): Service => ({
  id: 1,
  sitter_id: 1,
  type: 'walking',
  price: 25,
  ...overrides,
});

describe('computeOnboardingStatus', () => {
  it('returns all false when user has nothing set up', () => {
    const result = computeOnboardingStatus({ bio: '', avatar_url: '' }, [], false);
    expect(result.hasProfile).toBe(false);
    expect(result.hasServices).toBe(false);
    expect(result.hasPhoto).toBe(false);
    expect(result.hasVerification).toBe(false);
    expect(result.isComplete).toBe(false);
    expect(result.completedCount).toBe(0);
  });

  it('detects profile completion from bio', () => {
    const result = computeOnboardingStatus({ bio: 'I love pets' }, [], false);
    expect(result.hasProfile).toBe(true);
    expect(result.completedCount).toBe(1);
  });

  it('detects services completion', () => {
    const result = computeOnboardingStatus({}, [makeService()], false);
    expect(result.hasServices).toBe(true);
    expect(result.completedCount).toBe(1);
  });

  it('detects photo completion from avatar_url', () => {
    const result = computeOnboardingStatus({ avatar_url: 'https://example.com/pic.jpg' }, [], false);
    expect(result.hasPhoto).toBe(true);
    expect(result.completedCount).toBe(1);
  });

  it('detects verification completion', () => {
    const result = computeOnboardingStatus({}, [], true);
    expect(result.hasVerification).toBe(true);
    expect(result.completedCount).toBe(1);
  });

  it('returns isComplete only when all 4 are done', () => {
    const result = computeOnboardingStatus(
      { bio: 'I love pets', avatar_url: 'https://example.com/pic.jpg' },
      [makeService()],
      true
    );
    expect(result.isComplete).toBe(true);
    expect(result.completedCount).toBe(4);
  });

  it('returns isComplete false when only 3 of 4 done', () => {
    const result = computeOnboardingStatus(
      { bio: 'I love pets', avatar_url: 'https://example.com/pic.jpg' },
      [makeService()],
      false
    );
    expect(result.isComplete).toBe(false);
    expect(result.completedCount).toBe(3);
  });

  it('handles null user gracefully', () => {
    const result = computeOnboardingStatus(null, [], false);
    expect(result.hasProfile).toBe(false);
    expect(result.hasPhoto).toBe(false);
    expect(result.completedCount).toBe(0);
  });
});
