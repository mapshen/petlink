import sql from './db.ts';
import logger from './logger.ts';

const LOCKOUT_THRESHOLDS = [
  { failures: 5, windowMinutes: 15, lockoutMinutes: 15 },
  { failures: 10, windowMinutes: 60, lockoutMinutes: 60 },
] as const;

// IP-based threshold: catches credential stuffing across many accounts
const IP_LOCKOUT_THRESHOLD = { failures: 20, windowMinutes: 15, lockoutMinutes: 30 };

const EMAIL_ALERT_THRESHOLD = 3;

export interface LockoutStatus {
  locked: boolean;
  lockoutMinutes: number;
  failureCount: number;
  reason?: 'email' | 'ip';
}

/** Check if an email or IP is currently locked out */
export async function checkLockout(email: string, ipAddress?: string): Promise<LockoutStatus> {
  const normalizedEmail = email.toLowerCase().trim();
  const longestWindow = new Date(Date.now() - 60 * 60 * 1000);
  const shortWindow = new Date(Date.now() - 15 * 60 * 1000);

  // Per-email lockout check (single query for both thresholds)
  const [emailResult] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE attempted_at > ${shortWindow})::int as failures_15m,
      COUNT(*) FILTER (WHERE attempted_at > ${longestWindow})::int as failures_60m
    FROM login_attempts
    WHERE email = ${normalizedEmail}
      AND success = false
      AND attempted_at > ${longestWindow}
  `;

  if (emailResult.failures_60m >= LOCKOUT_THRESHOLDS[1].failures) {
    return { locked: true, lockoutMinutes: 60, failureCount: emailResult.failures_60m, reason: 'email' };
  }
  if (emailResult.failures_15m >= LOCKOUT_THRESHOLDS[0].failures) {
    return { locked: true, lockoutMinutes: 15, failureCount: emailResult.failures_15m, reason: 'email' };
  }

  // Per-IP lockout check (catches credential stuffing across many accounts)
  if (ipAddress) {
    const ipWindow = new Date(Date.now() - IP_LOCKOUT_THRESHOLD.windowMinutes * 60 * 1000);
    const [ipResult] = await sql`
      SELECT COUNT(*)::int as failure_count
      FROM login_attempts
      WHERE ip_address = ${ipAddress}
        AND success = false
        AND attempted_at > ${ipWindow}
    `;
    if (ipResult.failure_count >= IP_LOCKOUT_THRESHOLD.failures) {
      return { locked: true, lockoutMinutes: IP_LOCKOUT_THRESHOLD.lockoutMinutes, failureCount: ipResult.failure_count, reason: 'ip' };
    }
  }

  return { locked: false, lockoutMinutes: 0, failureCount: emailResult.failures_15m };
}

/** Record a login attempt */
export async function recordLoginAttempt(email: string, ipAddress: string | undefined, success: boolean): Promise<number> {
  const normalizedEmail = email.toLowerCase().trim();

  await sql`
    INSERT INTO login_attempts (email, ip_address, success)
    VALUES (${normalizedEmail}, ${ipAddress || null}, ${success})
  `;

  // On success, clear old failed attempts for this email
  if (success) {
    await sql`
      DELETE FROM login_attempts
      WHERE email = ${normalizedEmail} AND success = false
    `.catch((err) => logger.error({ err, email: normalizedEmail }, 'Failed to clear login attempts after successful login'));
  }

  // Probabilistic cleanup (~1% of requests) to prevent table bloat
  if (Math.random() < 0.01) {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    sql`DELETE FROM login_attempts WHERE attempted_at < ${cutoff}`.catch(() => {});
  }

  // Return current failure count for alert checking
  if (!success) {
    const windowStart = new Date(Date.now() - 15 * 60 * 1000);
    const [result] = await sql`
      SELECT COUNT(*)::int as failure_count
      FROM login_attempts
      WHERE email = ${normalizedEmail}
        AND success = false
        AND attempted_at > ${windowStart}
    `;
    return result.failure_count;
  }

  return 0;
}

/** Check if an email alert should be sent (exactly at threshold) */
export function shouldSendAlert(failureCount: number): boolean {
  return failureCount === EMAIL_ALERT_THRESHOLD;
}

/** Admin: clear lockout for an email */
export async function clearLockout(email: string, adminId?: number): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();
  await sql`
    DELETE FROM login_attempts
    WHERE email = ${normalizedEmail} AND success = false
  `;
  logger.info({ email: normalizedEmail, adminId }, 'Login lockout cleared by admin');
}
