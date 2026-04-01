import { describe, it, expect } from 'vitest';

interface TimeSlot {
  start_time: string;
  end_time: string;
  status: string;
}

/**
 * Tests for the double-booking prevention logic.
 * The SQL overlap check is: start_time < end AND end_time > start
 */
function hasOverlap(existing: TimeSlot[], newStart: string, newEnd: string): boolean {
  const activeStatuses = ['pending', 'confirmed', 'in_progress'];
  return existing.some(
    (b) =>
      activeStatuses.includes(b.status) &&
      new Date(b.start_time) < new Date(newEnd) &&
      new Date(b.end_time) > new Date(newStart)
  );
}

describe('booking overlap detection', () => {
  const existing: TimeSlot[] = [
    { start_time: '2026-04-01T10:00:00Z', end_time: '2026-04-01T11:00:00Z', status: 'confirmed' },
    { start_time: '2026-04-01T14:00:00Z', end_time: '2026-04-01T15:00:00Z', status: 'pending' },
    { start_time: '2026-04-01T18:00:00Z', end_time: '2026-04-01T19:00:00Z', status: 'cancelled' },
  ];

  it('detects full overlap', () => {
    expect(hasOverlap(existing, '2026-04-01T10:00:00Z', '2026-04-01T11:00:00Z')).toBe(true);
  });

  it('detects partial overlap (start inside existing)', () => {
    expect(hasOverlap(existing, '2026-04-01T10:30:00Z', '2026-04-01T11:30:00Z')).toBe(true);
  });

  it('detects partial overlap (end inside existing)', () => {
    expect(hasOverlap(existing, '2026-04-01T09:30:00Z', '2026-04-01T10:30:00Z')).toBe(true);
  });

  it('detects enclosing overlap (new booking wraps existing)', () => {
    expect(hasOverlap(existing, '2026-04-01T09:00:00Z', '2026-04-01T12:00:00Z')).toBe(true);
  });

  it('allows adjacent booking (ends when existing starts)', () => {
    expect(hasOverlap(existing, '2026-04-01T09:00:00Z', '2026-04-01T10:00:00Z')).toBe(false);
  });

  it('allows adjacent booking (starts when existing ends)', () => {
    expect(hasOverlap(existing, '2026-04-01T11:00:00Z', '2026-04-01T12:00:00Z')).toBe(false);
  });

  it('allows booking in gap between existing bookings', () => {
    expect(hasOverlap(existing, '2026-04-01T12:00:00Z', '2026-04-01T13:00:00Z')).toBe(false);
  });

  it('ignores cancelled bookings', () => {
    expect(hasOverlap(existing, '2026-04-01T18:00:00Z', '2026-04-01T19:00:00Z')).toBe(false);
  });

  it('detects overlap with pending bookings', () => {
    expect(hasOverlap(existing, '2026-04-01T14:30:00Z', '2026-04-01T15:30:00Z')).toBe(true);
  });
});
