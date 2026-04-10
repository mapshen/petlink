import { describe, it, expect } from 'vitest';
import { buildPolicyItems, type PolicyItem } from './PoliciesView';
import type { CancellationPolicy } from '../../types';

const baseSitter = {
  cancellation_policy: 'moderate' as CancellationPolicy,
  house_rules: 'No shoes indoors.',
  emergency_procedures: 'Nearest vet: Animal Medical Center.',
};

describe('PoliciesView buildPolicyItems', () => {
  it('returns all 4 items when all data present', () => {
    const loyaltyInfo = { tiers: [{ min_bookings: 5, discount_percent: 5 }], completed_bookings: 3 };
    const items = buildPolicyItems(baseSitter, loyaltyInfo);
    expect(items).toHaveLength(4);
    expect(items.map(i => i.id)).toEqual(['cancellation', 'house_rules', 'emergency', 'loyalty']);
  });

  it('includes cancellation policy with description', () => {
    const items = buildPolicyItems(baseSitter, null);
    const cancellation = items.find(i => i.id === 'cancellation');
    expect(cancellation).toBeDefined();
    expect(cancellation!.title).toBe('Moderate Cancellation');
    expect(cancellation!.description).toContain('50% refund');
  });

  it('includes house rules when present', () => {
    const items = buildPolicyItems(baseSitter, null);
    const rules = items.find(i => i.id === 'house_rules');
    expect(rules).toBeDefined();
    expect(rules!.description).toBe('No shoes indoors.');
  });

  it('excludes house rules when empty', () => {
    const sitter = { ...baseSitter, house_rules: null };
    const items = buildPolicyItems(sitter, null);
    expect(items.find(i => i.id === 'house_rules')).toBeUndefined();
  });

  it('includes emergency procedures when present', () => {
    const items = buildPolicyItems(baseSitter, null);
    const emergency = items.find(i => i.id === 'emergency');
    expect(emergency).toBeDefined();
    expect(emergency!.description).toContain('Animal Medical Center');
  });

  it('excludes emergency procedures when empty', () => {
    const sitter = { ...baseSitter, emergency_procedures: null };
    const items = buildPolicyItems(sitter, null);
    expect(items.find(i => i.id === 'emergency')).toBeUndefined();
  });

  it('includes loyalty discounts when tiers exist', () => {
    const loyaltyInfo = {
      tiers: [
        { min_bookings: 5, discount_percent: 5 },
        { min_bookings: 10, discount_percent: 10 },
      ],
      completed_bookings: 3,
    };
    const items = buildPolicyItems(baseSitter, loyaltyInfo);
    const loyalty = items.find(i => i.id === 'loyalty');
    expect(loyalty).toBeDefined();
    expect(loyalty!.description).toContain('5+ bookings: 5% off');
    expect(loyalty!.description).toContain('10+ bookings: 10% off');
  });

  it('excludes loyalty when no tiers', () => {
    const items = buildPolicyItems(baseSitter, null);
    expect(items.find(i => i.id === 'loyalty')).toBeUndefined();
  });

  it('excludes loyalty when tiers array empty', () => {
    const items = buildPolicyItems(baseSitter, { tiers: [], completed_bookings: 0 });
    expect(items.find(i => i.id === 'loyalty')).toBeUndefined();
  });

  it('excludes cancellation when no policy set', () => {
    const sitter = { ...baseSitter, cancellation_policy: null };
    const items = buildPolicyItems(sitter, null);
    expect(items.find(i => i.id === 'cancellation')).toBeUndefined();
  });

  it('returns empty array when no data', () => {
    const sitter = { cancellation_policy: null, house_rules: null, emergency_procedures: null };
    const items = buildPolicyItems(sitter, null);
    expect(items).toHaveLength(0);
  });
});
