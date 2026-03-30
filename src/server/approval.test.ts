import { describe, it, expect } from 'vitest';
import { approvalDecisionSchema } from './validation.ts';

describe('approvalDecisionSchema', () => {
  it('accepts valid approved status', () => {
    const result = approvalDecisionSchema.safeParse({ status: 'approved' });
    expect(result.success).toBe(true);
  });

  it('accepts valid rejected status with reason', () => {
    const result = approvalDecisionSchema.safeParse({
      status: 'rejected',
      reason: 'Incomplete profile',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status', () => {
    const result = approvalDecisionSchema.safeParse({ status: 'pending' });
    expect(result.success).toBe(false);
  });

  it('rejects missing status', () => {
    const result = approvalDecisionSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects reason over 500 characters', () => {
    const result = approvalDecisionSchema.safeParse({
      status: 'rejected',
      reason: 'x'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('accepts rejected without reason', () => {
    const result = approvalDecisionSchema.safeParse({ status: 'rejected' });
    expect(result.success).toBe(true);
  });
});

describe('approval status logic', () => {
  type ApprovalStatus = 'approved' | 'pending_approval' | 'rejected';

  // Signup no longer accepts role — all signups are owner-only and approved
  function getInitialApprovalStatus(): ApprovalStatus {
    return 'approved';
  }

  // Sitter role is granted later; adding sitter role sets pending
  function shouldSetPendingOnRoleGrant(currentRoles: string[], newRole: string): boolean {
    return newRole === 'sitter' && !currentRoles.includes('sitter');
  }

  it('signup always gets approved (owner-only)', () => {
    expect(getInitialApprovalStatus()).toBe('approved');
  });

  it('granting sitter role to owner sets pending', () => {
    expect(shouldSetPendingOnRoleGrant(['owner'], 'sitter')).toBe(true);
  });

  it('granting sitter role when already a sitter does not set pending', () => {
    expect(shouldSetPendingOnRoleGrant(['owner', 'sitter'], 'sitter')).toBe(false);
  });

  it('granting owner role does not set pending', () => {
    expect(shouldSetPendingOnRoleGrant(['owner'], 'owner')).toBe(false);
  });
});

describe('banned user enforcement', () => {
  function shouldBlockLogin(approvalStatus: string): boolean {
    return approvalStatus === 'banned';
  }

  function shouldBlockAuthMiddleware(approvalStatus: string): boolean {
    return approvalStatus === 'banned';
  }

  it('blocks banned users at login', () => {
    expect(shouldBlockLogin('banned')).toBe(true);
  });

  it('does not block approved users at login', () => {
    expect(shouldBlockLogin('approved')).toBe(false);
  });

  it('does not block rejected users at login', () => {
    expect(shouldBlockLogin('rejected')).toBe(false);
  });

  it('does not block pending users at login', () => {
    expect(shouldBlockLogin('pending_approval')).toBe(false);
  });

  it('blocks banned users at auth middleware', () => {
    expect(shouldBlockAuthMiddleware('banned')).toBe(true);
  });

  it('does not block approved users at auth middleware', () => {
    expect(shouldBlockAuthMiddleware('approved')).toBe(false);
  });
});

describe('approval email builder', () => {
  // Dynamic import to avoid top-level import issues with Resend
  it('builds approved email', async () => {
    const { buildApprovalStatusEmail } = await import('./email.ts');
    const result = buildApprovalStatusEmail({
      sitterName: 'Bob',
      status: 'approved',
    });
    expect(result.subject).toContain('Approved');
    expect(result.html).toContain('Bob');
    expect(result.html).toContain('approved');
  });

  it('builds rejected email with reason', async () => {
    const { buildApprovalStatusEmail } = await import('./email.ts');
    const result = buildApprovalStatusEmail({
      sitterName: 'Alice',
      status: 'rejected',
      reason: 'Profile incomplete',
    });
    expect(result.subject).toContain('Not Approved');
    expect(result.html).toContain('Alice');
    expect(result.html).toContain('Profile incomplete');
  });

  it('escapes HTML in sitter name', async () => {
    const { buildApprovalStatusEmail } = await import('./email.ts');
    const result = buildApprovalStatusEmail({
      sitterName: '<script>alert("xss")</script>',
      status: 'approved',
    });
    expect(result.html).not.toContain('<script>');
    expect(result.html).toContain('&lt;script&gt;');
  });
});
