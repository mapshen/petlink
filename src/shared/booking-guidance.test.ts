import { describe, it, expect } from 'vitest';
import { getBookingGuidance } from './booking-guidance';

describe('getBookingGuidance (owner)', () => {
  it('pending: waiting for sitter', () => {
    const g = getBookingGuidance('pending', 'owner');
    expect(g.title).toContain('Waiting');
    expect(g.color).toBe('amber');
  });

  it('confirmed: get ready', () => {
    const g = getBookingGuidance('confirmed', 'owner');
    expect(g.title).toContain('confirmed');
    expect(g.color).toBe('emerald');
  });

  it('in_progress: sitter is with pet', () => {
    const g = getBookingGuidance('in_progress', 'owner');
    expect(g.title).toContain('sitter');
    expect(g.color).toBe('blue');
  });

  it('completed: leave a review', () => {
    const g = getBookingGuidance('completed', 'owner');
    expect(g.title).toContain('review');
    expect(g.color).toBe('violet');
  });

  it('cancelled: booking cancelled', () => {
    const g = getBookingGuidance('cancelled', 'owner');
    expect(g.color).toBe('stone');
  });
});

describe('getBookingGuidance (sitter)', () => {
  it('pending: new request', () => {
    const g = getBookingGuidance('pending', 'sitter');
    expect(g.title).toContain('request');
    expect(g.color).toBe('amber');
  });

  it('confirmed: you are set', () => {
    const g = getBookingGuidance('confirmed', 'sitter');
    expect(g.color).toBe('emerald');
  });

  it('in_progress: session in progress', () => {
    const g = getBookingGuidance('in_progress', 'sitter');
    expect(g.title).toContain('progress');
    expect(g.color).toBe('blue');
  });

  it('completed: payment processing', () => {
    const g = getBookingGuidance('completed', 'sitter');
    expect(g.title).toContain('Payment');
    expect(g.color).toBe('violet');
  });
});

describe('unknown status', () => {
  it('returns empty guidance', () => {
    const g = getBookingGuidance('unknown_status', 'owner');
    expect(g.title).toBe('');
    expect(g.description).toBe('');
  });
});
