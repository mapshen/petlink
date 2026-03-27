import * as cheerio from 'cheerio';
import crypto from 'crypto';

const ALLOWED_HOSTS = new Set(['rover.com', 'www.rover.com']);

export function parseRoverUrl(url: string): { valid: true; username: string } | { valid: false; error: string } {
  try {
    const parsed = new URL(url);
    if (!ALLOWED_HOSTS.has(parsed.hostname)) {
      return { valid: false, error: 'URL must be from rover.com' };
    }
    if (parsed.protocol !== 'https:') {
      return { valid: false, error: 'URL must use HTTPS' };
    }
    const match = parsed.pathname.match(/^\/members\/([a-zA-Z0-9_-]+)/);
    if (!match) {
      return { valid: false, error: 'Invalid Rover profile URL format. Expected: rover.com/members/{username}/' };
    }
    return { valid: true, username: match[1] };
  } catch {
    return { valid: false, error: 'Invalid URL' };
  }
}

export function generateVerificationCode(): string {
  const bytes = crypto.randomBytes(4);
  return `PL-${bytes.toString('hex')}`;
}

export function parseRoverProfileHtml(html: string): {
  name: string;
  bio: string;
  rating: number;
  reviewCount: number;
  reviews: { reviewerName: string; rating: number; comment: string; date?: string }[];
} {
  const $ = cheerio.load(html);

  const name = $('h1.sitter-name, [data-testid="sitter-name"], .profile-hero h1').first().text().trim() || 'Unknown';
  const bio = $('.about-me, [data-testid="about-section"], .sitter-bio').first().text().trim() || '';

  const ratingText = $('.star-rating .rating-value, [data-testid="rating"], .overall-rating').first().text().trim();
  const rating = parseFloat(ratingText) || 0;

  const reviewCountText = $('.review-count, [data-testid="review-count"]').first().text().trim();
  const reviewCountMatch = reviewCountText.match(/(\d+)/);
  const reviewCount = reviewCountMatch ? parseInt(reviewCountMatch[1], 10) : 0;

  const reviews: { reviewerName: string; rating: number; comment: string; date?: string }[] = [];
  $('.review-card, [data-testid="review"]').each((_, el) => {
    const reviewerName = $(el).find('.reviewer-name, [data-testid="reviewer-name"]').text().trim() || 'Anonymous';
    const reviewRatingText = $(el).find('.review-rating, [data-testid="review-rating"]').text().trim();
    const reviewRating = parseInt(reviewRatingText, 10) || 5;
    const comment = $(el).find('.review-text, [data-testid="review-text"]').text().trim() || '';
    const date = $(el).find('.review-date, [data-testid="review-date"]').text().trim() || undefined;
    reviews.push({ reviewerName, rating: reviewRating, comment, date });
  });

  return { name, bio, rating, reviewCount, reviews };
}

export function checkVerificationCode(html: string, code: string): boolean {
  const $ = cheerio.load(html);
  const bioText = $('.about-me, [data-testid="about-section"], .sitter-bio').first().text();
  return bioText.includes(code);
}

export async function scrapeRoverProfile(url: string): Promise<{
  name: string;
  bio: string;
  rating: number;
  reviewCount: number;
  reviews: { reviewerName: string; rating: number; comment: string; date?: string }[];
  rawHtml: string;
}> {
  // Defense in depth: validate URL even if caller should have already validated
  const parsed = parseRoverUrl(url);
  if (!parsed.valid) {
    throw new Error('Invalid Rover URL');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch profile: ${response.status}`);
    }

    const rawHtml = await response.text();
    const parsed = parseRoverProfileHtml(rawHtml);
    return { ...parsed, rawHtml };
  } finally {
    clearTimeout(timeout);
  }
}
