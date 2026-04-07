import { describe, it, expect } from 'vitest';
import {
  TEMPLATES,
  getTemplateById,
  buildMarketingData,
  generateFileName,
  type MarketingData,
  type TemplateDefinition,
} from './marketing-templates';
import type { CardData } from './qr-business-card';

const baseCardData: CardData = {
  name: 'Jane Doe',
  avatarUrl: 'https://cdn.example.com/jane.jpg',
  tagline: 'Experienced sitter who loves all animals.',
  rating: 4.8,
  reviewCount: 42,
  serviceLabels: ['Walking', 'House Sitting', 'Daycare'],
};

const profileUrl = 'https://petlink.com/sitters/jane-doe?ref=flyer';

describe('TEMPLATES', () => {
  it('exports at least 3 template definitions', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(3);
  });

  it('each template has required fields', () => {
    for (const t of TEMPLATES) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(t.category).toMatch(/^(flyer|social)$/);
      expect(t.width).toBeGreaterThan(0);
      expect(t.height).toBeGreaterThan(0);
      expect(typeof t.render).toBe('function');
    }
  });

  it('all template IDs are unique', () => {
    const ids = TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('getTemplateById', () => {
  it('returns matching template', () => {
    const first = TEMPLATES[0];
    const found = getTemplateById(first.id);
    expect(found).toBe(first);
  });

  it('returns undefined for unknown ID', () => {
    expect(getTemplateById('nonexistent')).toBeUndefined();
  });
});

describe('buildMarketingData', () => {
  it('builds marketing data from card data and profile URL', () => {
    const data = buildMarketingData(baseCardData, profileUrl);
    expect(data.name).toBe('Jane Doe');
    expect(data.tagline).toBe('Experienced sitter who loves all animals.');
    expect(data.rating).toBe(4.8);
    expect(data.reviewCount).toBe(42);
    expect(data.serviceLabels).toEqual(['Walking', 'House Sitting', 'Daycare']);
    expect(data.profileUrl).toBe(profileUrl);
  });

  it('handles null rating', () => {
    const noRating: CardData = { ...baseCardData, rating: null, reviewCount: 0 };
    const data = buildMarketingData(noRating, profileUrl);
    expect(data.rating).toBeNull();
    expect(data.reviewCount).toBe(0);
  });

  it('handles empty services', () => {
    const noServices: CardData = { ...baseCardData, serviceLabels: [] };
    const data = buildMarketingData(noServices, profileUrl);
    expect(data.serviceLabels).toEqual([]);
  });

  it('handles empty tagline', () => {
    const noBio: CardData = { ...baseCardData, tagline: '' };
    const data = buildMarketingData(noBio, profileUrl);
    expect(data.tagline).toBe('');
  });
});

describe('generateFileName', () => {
  it('produces safe filename from template and name', () => {
    const name = generateFileName('professional-flyer', 'Jane Doe');
    expect(name).toBe('petlink-professional-flyer-jane-doe.png');
  });

  it('sanitizes special characters', () => {
    const name = generateFileName('social-card', "O'Brien & Co.");
    expect(name).toMatch(/^petlink-social-card-[a-z0-9-]+\.png$/);
    expect(name).not.toContain("'");
    expect(name).not.toContain('&');
  });

  it('truncates long names', () => {
    const longName = 'A'.repeat(100);
    const name = generateFileName('professional-flyer', longName);
    expect(name.length).toBeLessThan(120);
  });

  it('handles empty name gracefully', () => {
    const name = generateFileName('professional-flyer', '');
    expect(name).toBe('petlink-professional-flyer-sitter.png');
  });
});
