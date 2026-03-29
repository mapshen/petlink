import type { CancellationPolicy } from '../types.ts';

const POLICY_DESCRIPTIONS: Record<CancellationPolicy, string> = {
  flexible: 'Full refund if cancelled at least 24 hours before the booking.',
  moderate: '50% refund if cancelled at least 48 hours before the booking.',
  strict: 'No refund within 7 days of the booking.',
};

export function getPolicyDescription(policy: CancellationPolicy): string {
  return POLICY_DESCRIPTIONS[policy];
}
