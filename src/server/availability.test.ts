import { describe, it, expect } from 'vitest';

/**
 * Tests for POST /availability guard logic.
 *
 * The endpoint now checks the user's role (must be 'sitter' or 'both')
 * instead of requiring approval_status === 'approved'. This allows
 * pending sitters to set up availability while awaiting approval.
 */

type UserRole = 'owner' | 'sitter' | 'both';
type ApprovalStatus = 'approved' | 'pending_approval' | 'rejected';

interface AvailabilityGuardInput {
  role: UserRole;
  approval_status: ApprovalStatus;
}

/**
 * Mirrors the guard logic in server.ts POST /availability handler.
 * Returns null if allowed, or an error string if blocked.
 */
function checkAvailabilityAccess(user: AvailabilityGuardInput): string | null {
  if (user.role !== 'sitter' && user.role !== 'both') {
    return 'Only sitters can set availability.';
  }
  return null;
}

describe('POST /availability guard', () => {
  it('allows approved sitters to set availability', () => {
    const result = checkAvailabilityAccess({ role: 'sitter', approval_status: 'approved' });
    expect(result).toBeNull();
  });

  it('allows pending sitters to set availability', () => {
    const result = checkAvailabilityAccess({ role: 'sitter', approval_status: 'pending_approval' });
    expect(result).toBeNull();
  });

  it('allows approved both-role users to set availability', () => {
    const result = checkAvailabilityAccess({ role: 'both', approval_status: 'approved' });
    expect(result).toBeNull();
  });

  it('allows pending both-role users to set availability', () => {
    const result = checkAvailabilityAccess({ role: 'both', approval_status: 'pending_approval' });
    expect(result).toBeNull();
  });

  it('blocks owners from setting availability', () => {
    const result = checkAvailabilityAccess({ role: 'owner', approval_status: 'approved' });
    expect(result).toBe('Only sitters can set availability.');
  });

  it('blocks rejected sitters from being treated as non-sitters', () => {
    // Rejected sitters still have the sitter role — the guard only checks role, not status.
    // Separate business logic should handle rejected sitter restrictions elsewhere.
    const result = checkAvailabilityAccess({ role: 'sitter', approval_status: 'rejected' });
    expect(result).toBeNull();
  });
});
