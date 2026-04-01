import { describe, it, expect } from 'vitest';

interface LoginAttempt {
  email: string;
  attempted_at: Date;
  success: boolean;
}

const LOCKOUT_THRESHOLDS = [
  { failures: 5, windowMinutes: 15, lockoutMinutes: 15 },
  { failures: 10, windowMinutes: 60, lockoutMinutes: 60 },
];

const EMAIL_ALERT_THRESHOLD = 3;

function getLockoutStatus(
  attempts: LoginAttempt[],
  now: Date
): { locked: boolean; lockoutMinutes: number; failureCount: number } {
  for (const threshold of [...LOCKOUT_THRESHOLDS].reverse()) {
    const windowStart = new Date(now.getTime() - threshold.windowMinutes * 60 * 1000);
    const recentFailures = attempts.filter(
      (a) => !a.success && a.attempted_at >= windowStart
    );
    if (recentFailures.length >= threshold.failures) {
      return { locked: true, lockoutMinutes: threshold.lockoutMinutes, failureCount: recentFailures.length };
    }
  }

  const shortWindow = new Date(now.getTime() - LOCKOUT_THRESHOLDS[0].windowMinutes * 60 * 1000);
  const recentFailures = attempts.filter(
    (a) => !a.success && a.attempted_at >= shortWindow
  );
  return { locked: false, lockoutMinutes: 0, failureCount: recentFailures.length };
}

function shouldSendAlert(failureCount: number): boolean {
  return failureCount === EMAIL_ALERT_THRESHOLD;
}

describe('getLockoutStatus', () => {
  const now = new Date('2026-04-01T12:00:00Z');

  it('allows login with no prior attempts', () => {
    const result = getLockoutStatus([], now);
    expect(result.locked).toBe(false);
    expect(result.failureCount).toBe(0);
  });

  it('allows login with fewer than 5 failures', () => {
    const attempts = Array.from({ length: 4 }, (_, i) => ({
      email: 'test@test.com',
      attempted_at: new Date(now.getTime() - i * 60 * 1000),
      success: false,
    }));
    const result = getLockoutStatus(attempts, now);
    expect(result.locked).toBe(false);
    expect(result.failureCount).toBe(4);
  });

  it('locks after 5 failures in 15 minutes', () => {
    const attempts = Array.from({ length: 5 }, (_, i) => ({
      email: 'test@test.com',
      attempted_at: new Date(now.getTime() - i * 60 * 1000),
      success: false,
    }));
    const result = getLockoutStatus(attempts, now);
    expect(result.locked).toBe(true);
    expect(result.lockoutMinutes).toBe(15);
  });

  it('locks for 1 hour after 10 failures in 60 minutes', () => {
    const attempts = Array.from({ length: 10 }, (_, i) => ({
      email: 'test@test.com',
      attempted_at: new Date(now.getTime() - i * 5 * 60 * 1000),
      success: false,
    }));
    const result = getLockoutStatus(attempts, now);
    expect(result.locked).toBe(true);
    expect(result.lockoutMinutes).toBe(60);
  });

  it('ignores failures outside the window', () => {
    const attempts = Array.from({ length: 5 }, (_, i) => ({
      email: 'test@test.com',
      attempted_at: new Date(now.getTime() - (20 + i) * 60 * 1000), // 20-24 min ago
      success: false,
    }));
    const result = getLockoutStatus(attempts, now);
    expect(result.locked).toBe(false);
  });

  it('does not count successful attempts', () => {
    const attempts = [
      ...Array.from({ length: 4 }, (_, i) => ({
        email: 'test@test.com',
        attempted_at: new Date(now.getTime() - i * 60 * 1000),
        success: false,
      })),
      { email: 'test@test.com', attempted_at: new Date(now.getTime() - 5 * 60 * 1000), success: true },
    ];
    const result = getLockoutStatus(attempts, now);
    expect(result.locked).toBe(false);
    expect(result.failureCount).toBe(4);
  });
});

describe('shouldSendAlert', () => {
  it('sends alert at exactly 3 failures', () => {
    expect(shouldSendAlert(3)).toBe(true);
  });

  it('does not send alert below 3', () => {
    expect(shouldSendAlert(2)).toBe(false);
  });

  it('does not re-send after 3', () => {
    expect(shouldSendAlert(4)).toBe(false);
    expect(shouldSendAlert(5)).toBe(false);
  });
});
