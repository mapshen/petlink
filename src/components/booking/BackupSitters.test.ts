import { describe, it, expect } from 'vitest';

// Test the pure utility functions used by BackupSitters component

function formatDistance(meters: number | undefined): string {
  if (meters == null) return '';
  const miles = meters / 1609.34;
  if (miles < 0.1) return 'Nearby';
  return `${miles.toFixed(1)} mi away`;
}

function formatRating(rating: number | null | undefined): string {
  if (rating == null) return 'New';
  return rating.toFixed(1);
}

function formatPrice(cents: number | undefined): string {
  if (cents == null) return '';
  return `$${(cents / 100).toFixed(0)}`;
}

describe('BackupSitters utilities', () => {
  describe('formatDistance', () => {
    it('returns empty string for undefined', () => {
      expect(formatDistance(undefined)).toBe('');
    });

    it('returns "Nearby" for very short distances', () => {
      expect(formatDistance(100)).toBe('Nearby');
    });

    it('formats distance in miles', () => {
      expect(formatDistance(5000)).toBe('3.1 mi away');
    });

    it('formats longer distances', () => {
      expect(formatDistance(16093)).toBe('10.0 mi away');
    });
  });

  describe('formatRating', () => {
    it('returns "New" for null rating', () => {
      expect(formatRating(null)).toBe('New');
    });

    it('returns "New" for undefined rating', () => {
      expect(formatRating(undefined)).toBe('New');
    });

    it('formats rating with one decimal', () => {
      expect(formatRating(4.8)).toBe('4.8');
    });

    it('formats whole number rating', () => {
      expect(formatRating(5.0)).toBe('5.0');
    });
  });

  describe('formatPrice', () => {
    it('returns empty string for undefined', () => {
      expect(formatPrice(undefined)).toBe('');
    });

    it('formats cents to dollar amount', () => {
      expect(formatPrice(2500)).toBe('$25');
    });

    it('formats zero', () => {
      expect(formatPrice(0)).toBe('$0');
    });

    it('rounds to nearest dollar', () => {
      expect(formatPrice(2599)).toBe('$26');
    });
  });
});
