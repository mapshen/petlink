import { describe, it, expect } from 'vitest';
import {
  TEMPLATES,
  getTemplateById,
  buildMarketingData,
  generateFileName,
} from '../../lib/marketing-templates';
import { buildCardData, buildProfileUrl } from '../../lib/qr-business-card';

/**
 * MarketingMaterials component tests.
 *
 * Tests the data pipeline that feeds the component: template catalog,
 * marketing data construction, and filename generation. The React
 * component is primarily visual (canvas rendering), so we test the
 * pure logic layer that backs it.
 */

const sitterUser = {
  id: 7,
  name: 'Alex Rivera',
  email: 'alex@example.com',
  roles: ['owner', 'sitter'],
  slug: 'alex-rivera',
  bio: 'Dog walker and pet sitter in the Bay Area. 5 years of experience with all breeds.',
  avatar_url: 'https://cdn.example.com/alex.jpg',
  avg_rating: 4.7,
  review_count: 63,
} as any;

const services = [
  { id: 1, sitter_id: 7, type: 'walking', price_cents: 2800 },
  { id: 2, sitter_id: 7, type: 'daycare', price_cents: 4000 },
] as any[];

describe('MarketingMaterials data pipeline', () => {
  describe('template catalog', () => {
    it('includes professional flyer template', () => {
      const t = getTemplateById('professional-flyer');
      expect(t).toBeDefined();
      expect(t!.category).toBe('flyer');
      expect(t!.width).toBe(612);
      expect(t!.height).toBe(792);
    });

    it('includes social card template', () => {
      const t = getTemplateById('social-card');
      expect(t).toBeDefined();
      expect(t!.category).toBe('social');
      expect(t!.width).toBe(1080);
      expect(t!.height).toBe(1080);
    });

    it('includes neighborhood flyer template', () => {
      const t = getTemplateById('neighborhood-flyer');
      expect(t).toBeDefined();
      expect(t!.category).toBe('flyer');
    });

    it('all templates have render functions', () => {
      for (const t of TEMPLATES) {
        expect(typeof t.render).toBe('function');
      }
    });
  });

  describe('marketing data from card data', () => {
    it('builds marketing data with profile URL', () => {
      const cardData = buildCardData(sitterUser, services);
      const profileUrl = buildProfileUrl(sitterUser.slug, 'https://petlink.com', 'flyer');
      const marketingData = buildMarketingData(cardData, profileUrl);

      expect(marketingData.name).toBe('Alex Rivera');
      expect(marketingData.profileUrl).toContain('ref=flyer');
      expect(marketingData.serviceLabels).toContain('Walking');
      expect(marketingData.serviceLabels).toContain('Daycare');
      expect(marketingData.rating).toBe(4.7);
      expect(marketingData.reviewCount).toBe(63);
    });

    it('preserves all card data fields', () => {
      const cardData = buildCardData(sitterUser, services);
      const marketingData = buildMarketingData(cardData, 'https://example.com');
      expect(marketingData.name).toBe(cardData.name);
      expect(marketingData.tagline).toBe(cardData.tagline);
      expect(marketingData.rating).toBe(cardData.rating);
      expect(marketingData.reviewCount).toBe(cardData.reviewCount);
      expect(marketingData.serviceLabels).toEqual(cardData.serviceLabels);
    });
  });

  describe('filename generation', () => {
    it('generates correct filename for professional flyer', () => {
      const name = generateFileName('professional-flyer', 'Alex Rivera');
      expect(name).toBe('petlink-professional-flyer-alex-rivera.png');
    });

    it('generates correct filename for social card', () => {
      const name = generateFileName('social-card', 'Alex Rivera');
      expect(name).toBe('petlink-social-card-alex-rivera.png');
    });

    it('generates correct filename for neighborhood flyer', () => {
      const name = generateFileName('neighborhood-flyer', 'Alex Rivera');
      expect(name).toBe('petlink-neighborhood-flyer-alex-rivera.png');
    });

    it('handles special characters in name', () => {
      const name = generateFileName('social-card', "Li Wei's Pet Care!");
      expect(name).not.toContain("'");
      expect(name).not.toContain('!');
      expect(name).toMatch(/\.png$/);
    });
  });

  describe('profile URL with flyer ref source', () => {
    it('uses flyer ref source in URL', () => {
      const url = buildProfileUrl('alex-rivera', 'https://petlink.com', 'flyer');
      expect(url).toBe('https://petlink.com/sitters/alex-rivera?ref=flyer');
    });

    it('uses social ref source for social card', () => {
      const url = buildProfileUrl('alex-rivera', 'https://petlink.com', 'social');
      expect(url).toBe('https://petlink.com/sitters/alex-rivera?ref=social');
    });
  });
});
