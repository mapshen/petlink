import { describe, it, expect } from 'vitest';
import { parseRoverUrl, generateVerificationCode, parseRoverProfileHtml, checkVerificationCode } from './profile-import';

describe('parseRoverUrl', () => {
  it('parses valid Rover profile URL', () => {
    const result = parseRoverUrl('https://www.rover.com/members/johndoe/');
    expect(result).toEqual({ valid: true, username: 'johndoe' });
  });

  it('parses URL without trailing slash', () => {
    const result = parseRoverUrl('https://www.rover.com/members/johndoe');
    expect(result).toEqual({ valid: true, username: 'johndoe' });
  });

  it('parses URL with query params', () => {
    const result = parseRoverUrl('https://www.rover.com/members/johndoe/?ref=123');
    expect(result).toEqual({ valid: true, username: 'johndoe' });
  });

  it('handles username with hyphens and underscores', () => {
    const result = parseRoverUrl('https://www.rover.com/members/john-doe_123/');
    expect(result).toEqual({ valid: true, username: 'john-doe_123' });
  });

  it('rejects non-Rover URLs', () => {
    const result = parseRoverUrl('https://www.example.com/members/johndoe/');
    expect(result).toEqual({ valid: false, error: 'URL must be from rover.com' });
  });

  it('rejects Rover URL without members path', () => {
    const result = parseRoverUrl('https://www.rover.com/search/');
    expect(result).toEqual({ valid: false, error: expect.stringContaining('Invalid Rover profile URL') });
  });

  it('rejects invalid URL', () => {
    const result = parseRoverUrl('not-a-url');
    expect(result).toEqual({ valid: false, error: 'Invalid URL' });
  });

  it('rejects empty string', () => {
    const result = parseRoverUrl('');
    expect(result).toEqual({ valid: false, error: 'Invalid URL' });
  });
});

describe('generateVerificationCode', () => {
  it('starts with PL- prefix', () => {
    const code = generateVerificationCode();
    expect(code).toMatch(/^PL-/);
  });

  it('has correct length (PL- + 8 hex chars)', () => {
    const code = generateVerificationCode();
    expect(code).toHaveLength(11); // "PL-" + 8 hex chars
  });

  it('generates unique codes', () => {
    const codes = new Set(Array.from({ length: 100 }, () => generateVerificationCode()));
    expect(codes.size).toBe(100);
  });
});

describe('parseRoverProfileHtml', () => {
  const mockHtml = `
    <html>
    <body>
      <h1 class="sitter-name">Jane Smith</h1>
      <div class="about-me">I love all animals! PL-abc12345</div>
      <span class="star-rating"><span class="rating-value">4.8</span></span>
      <span class="review-count">42 reviews</span>
      <div class="review-card">
        <span class="reviewer-name">Alice</span>
        <span class="review-rating">5</span>
        <div class="review-text">Jane is amazing with my dog!</div>
        <span class="review-date">Jan 15, 2026</span>
      </div>
      <div class="review-card">
        <span class="reviewer-name">Bob</span>
        <span class="review-rating">4</span>
        <div class="review-text">Great service, highly recommend.</div>
        <span class="review-date">Dec 20, 2025</span>
      </div>
    </body>
    </html>
  `;

  it('extracts sitter name', () => {
    const result = parseRoverProfileHtml(mockHtml);
    expect(result.name).toBe('Jane Smith');
  });

  it('extracts bio', () => {
    const result = parseRoverProfileHtml(mockHtml);
    expect(result.bio).toContain('I love all animals');
  });

  it('extracts rating', () => {
    const result = parseRoverProfileHtml(mockHtml);
    expect(result.rating).toBe(4.8);
  });

  it('extracts review count', () => {
    const result = parseRoverProfileHtml(mockHtml);
    expect(result.reviewCount).toBe(42);
  });

  it('extracts individual reviews', () => {
    const result = parseRoverProfileHtml(mockHtml);
    expect(result.reviews).toHaveLength(2);
    expect(result.reviews[0]).toEqual({
      reviewerName: 'Alice',
      rating: 5,
      comment: 'Jane is amazing with my dog!',
      date: 'Jan 15, 2026',
    });
  });

  it('handles empty HTML gracefully', () => {
    const result = parseRoverProfileHtml('<html><body></body></html>');
    expect(result.name).toBe('Unknown');
    expect(result.bio).toBe('');
    expect(result.rating).toBe(0);
    expect(result.reviews).toHaveLength(0);
  });
});

describe('checkVerificationCode', () => {
  const htmlWithCode = `
    <html><body>
      <div class="about-me">I love pets! PL-abc12345 Check me out.</div>
    </body></html>
  `;

  it('finds verification code in bio', () => {
    expect(checkVerificationCode(htmlWithCode, 'PL-abc12345')).toBe(true);
  });

  it('returns false for missing code', () => {
    expect(checkVerificationCode(htmlWithCode, 'PL-xxxxxxxx')).toBe(false);
  });

  it('returns false for empty HTML', () => {
    expect(checkVerificationCode('<html><body></body></html>', 'PL-abc12345')).toBe(false);
  });
});
