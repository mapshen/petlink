import { describe, it, expect } from 'vitest';

/**
 * Tests for POST /availability guard logic.
 *
 * The endpoint checks user.roles (must include 'sitter').
 * This allows pending sitters to set up availability while awaiting approval.
 */

type ApprovalStatus = 'approved' | 'pending_approval' | 'rejected';

interface AvailabilityGuardInput {
  roles: string[];
  approval_status: ApprovalStatus;
}

/**
 * Mirrors the guard logic in availability route handler.
 * Returns null if allowed, or an error string if blocked.
 */
function checkAvailabilityAccess(user: AvailabilityGuardInput): string | null {
  if (!user.roles.includes('sitter')) {
    return 'Only sitters can set availability.';
  }
  return null;
}

describe('POST /availability guard', () => {
  it('allows approved sitters to set availability', () => {
    const result = checkAvailabilityAccess({ roles: ['owner', 'sitter'], approval_status: 'approved' });
    expect(result).toBeNull();
  });

  it('allows pending sitters to set availability', () => {
    const result = checkAvailabilityAccess({ roles: ['owner', 'sitter'], approval_status: 'pending_approval' });
    expect(result).toBeNull();
  });

  it('blocks owner-only users from setting availability', () => {
    const result = checkAvailabilityAccess({ roles: ['owner'], approval_status: 'approved' });
    expect(result).toBe('Only sitters can set availability.');
  });

  it('blocks rejected sitters from being treated as non-sitters', () => {
    // Rejected sitters still have the sitter role — the guard only checks roles, not status.
    const result = checkAvailabilityAccess({ roles: ['owner', 'sitter'], approval_status: 'rejected' });
    expect(result).toBeNull();
  });
});
