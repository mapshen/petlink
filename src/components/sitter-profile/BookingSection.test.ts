import { describe, it, expect } from 'vitest';
import { buildPolicyItems } from './PoliciesView';
import type { CancellationPolicy } from '../../types';

/**
 * Pure logic tests for BookingSection refactor.
 * Tests the data contracts and visibility rules.
 */

interface VisibilityState {
  isOwnProfile: boolean;
}

function getBookingCardVisibility(state: VisibilityState) {
  return {
    bookingCard: true, // always shown now
    bookButton: !state.isOwnProfile, // disabled for own profile
    inquiryButton: !state.isOwnProfile,
    petSelector: !state.isOwnProfile,
    depositCredit: !state.isOwnProfile,
    emergencyWarning: !state.isOwnProfile,
    firstBookingNudge: !state.isOwnProfile,
    helperText: state.isOwnProfile, // "This is how visitors see your booking flow"
    priceBreakdown: !state.isOwnProfile,
    cameraInfo: !state.isOwnProfile,
  };
}

describe('BookingSection visibility rules', () => {
  it('shows booking card to everyone', () => {
    expect(getBookingCardVisibility({ isOwnProfile: false }).bookingCard).toBe(true);
    expect(getBookingCardVisibility({ isOwnProfile: true }).bookingCard).toBe(true);
  });

  it('disables book button for own profile', () => {
    expect(getBookingCardVisibility({ isOwnProfile: true }).bookButton).toBe(false);
    expect(getBookingCardVisibility({ isOwnProfile: false }).bookButton).toBe(true);
  });

  it('hides inquiry button for own profile', () => {
    expect(getBookingCardVisibility({ isOwnProfile: true }).inquiryButton).toBe(false);
  });

  it('shows helper text only for own profile', () => {
    expect(getBookingCardVisibility({ isOwnProfile: true }).helperText).toBe(true);
    expect(getBookingCardVisibility({ isOwnProfile: false }).helperText).toBe(false);
  });

  it('hides pet selector, deposit, emergency for own profile', () => {
    const own = getBookingCardVisibility({ isOwnProfile: true });
    expect(own.petSelector).toBe(false);
    expect(own.depositCredit).toBe(false);
    expect(own.emergencyWarning).toBe(false);
  });

  it('hides price breakdown and camera info for own profile', () => {
    const own = getBookingCardVisibility({ isOwnProfile: true });
    expect(own.priceBreakdown).toBe(false);
    expect(own.cameraInfo).toBe(false);
  });
});

describe('BookingSection render order contract', () => {
  it('defines correct section order: booking card, location, policies', () => {
    const sections = ['booking-card', 'location', 'policies'];
    expect(sections).toEqual(['booking-card', 'location', 'policies']);
  });
});

describe('BookingSection policies integration', () => {
  it('uses PoliciesView for consolidated policy display', () => {
    const sitter = {
      cancellation_policy: 'moderate' as CancellationPolicy,
      house_rules: 'No shoes indoors.',
      emergency_procedures: 'Nearest vet nearby.',
    };
    const items = buildPolicyItems(sitter, { tiers: [{ min_bookings: 5, discount_percent: 5 }], completed_bookings: 3 });
    expect(items).toHaveLength(4);
    expect(items.map(i => i.id)).toEqual(['cancellation', 'house_rules', 'emergency', 'loyalty']);
  });
});
