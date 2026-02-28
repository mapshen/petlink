import { describe, it, expect } from 'vitest';
import { OnboardingStatus } from '../hooks/useOnboardingStatus';

// Test the pure logic used by OnboardingChecklist — rendering depends on status props

function computeChecklistDisplay(status: Pick<OnboardingStatus, 'completedCount' | 'hasProfile' | 'hasServices'>) {
  const pct = Math.round((status.completedCount / 4) * 100);
  const requiredDone = status.hasProfile && status.hasServices;
  return { pct, requiredDone };
}

describe('OnboardingChecklist display logic', () => {
  it('shows 0% when nothing is done', () => {
    const result = computeChecklistDisplay({ completedCount: 0, hasProfile: false, hasServices: false });
    expect(result.pct).toBe(0);
    expect(result.requiredDone).toBe(false);
  });

  it('shows 25% when 1 of 4 done', () => {
    const result = computeChecklistDisplay({ completedCount: 1, hasProfile: true, hasServices: false });
    expect(result.pct).toBe(25);
    expect(result.requiredDone).toBe(false);
  });

  it('shows 50% and requiredDone when profile + services done', () => {
    const result = computeChecklistDisplay({ completedCount: 2, hasProfile: true, hasServices: true });
    expect(result.pct).toBe(50);
    expect(result.requiredDone).toBe(true);
  });

  it('shows 100% when all done', () => {
    const result = computeChecklistDisplay({ completedCount: 4, hasProfile: true, hasServices: true });
    expect(result.pct).toBe(100);
    expect(result.requiredDone).toBe(true);
  });

  it('does not show requiredDone if only services done', () => {
    const result = computeChecklistDisplay({ completedCount: 1, hasProfile: false, hasServices: true });
    expect(result.requiredDone).toBe(false);
  });
});
