import { describe, it, expect } from 'vitest';

const REVIEW_DEADLINE_MS = 30 * 24 * 60 * 60 * 1000;

function isReviewExpired(bookingEndTime: string): boolean {
  const bookingAge = Date.now() - new Date(bookingEndTime).getTime();
  return bookingAge > REVIEW_DEADLINE_MS;
}

describe('review deadline (30 days from booking end)', () => {
  it('allows review within 30 days', () => {
    const recent = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    expect(isReviewExpired(recent)).toBe(false);
  });

  it('allows review at exactly 29 days', () => {
    const justBefore = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString();
    expect(isReviewExpired(justBefore)).toBe(false);
  });

  it('blocks review after 31 days', () => {
    const expired = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    expect(isReviewExpired(expired)).toBe(true);
  });

  it('allows review on same day', () => {
    const today = new Date().toISOString();
    expect(isReviewExpired(today)).toBe(false);
  });

  it('allows review at exactly 30 days (boundary)', () => {
    const exact = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    expect(isReviewExpired(exact)).toBe(false);
  });
});
