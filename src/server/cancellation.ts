import type { CancellationPolicy } from '../types.ts';

export const POLICY_RULES = {
  flexible: { hours: 24, refundPercent: 100 },
  moderate: { hours: 48, refundPercent: 50 },
  strict: { hours: 168, refundPercent: 0 }, // 7 days
} as const;

export interface RefundResult {
  refundPercent: number;
  refundAmount: number;
  eligible: boolean;
  reason: string;
}

export function calculateRefund(
  policy: CancellationPolicy,
  totalCents: number,
  startTime: Date,
  cancelTime: Date
): RefundResult {
  const rule = POLICY_RULES[policy];
  const msUntilStart = startTime.getTime() - cancelTime.getTime();
  const hoursUntilStart = msUntilStart / (1000 * 60 * 60);

  // Booking already started — no refund regardless of policy
  if (msUntilStart <= 0) {
    return {
      refundPercent: 0,
      refundAmount: 0,
      eligible: false,
      reason: `${policy} policy: no refund (booking has already started)`,
    };
  }

  // Strict always returns 0 refund
  if (policy === 'strict') {
    return {
      refundPercent: 0,
      refundAmount: 0,
      eligible: false,
      reason: 'Strict policy: no refunds',
    };
  }

  const eligible = hoursUntilStart >= rule.hours;
  const refundPercent = eligible ? rule.refundPercent : 0;
  const refundAmount = Math.floor(totalCents * (refundPercent / 100));

  return {
    refundPercent,
    refundAmount,
    eligible,
    reason: eligible
      ? `${policy} policy: ${refundPercent}% refund (cancelled ${Math.floor(hoursUntilStart)}h before)`
      : `${policy} policy: no refund (cancelled less than ${rule.hours}h before)`,
  };
}

export { getPolicyDescription } from '../shared/cancellation.ts';
