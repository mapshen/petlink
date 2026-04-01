import sql from './db.ts';
import logger from './logger.ts';

const LOCKOUT_THRESHOLDS = [
  { failures: 5, windowMinutes: 15, lockoutMinutes: 15 },
  { failures: 10, windowMinutes: 60, lockoutMinutes: 60 },
] as const;

const EMAIL_ALERT_THRESHOLD = 3;

export interface LockoutStatus {
  locked: boolean;
  lockoutMinutes: number;
  failureCount: number;
}

/** Check if an email is currently locked out — single query for all thresholds */
export async function checkLockout(email: string): Promise<LockoutStatus> {
  const normalizedEmail = email.toLowerCase().trim();
  const longestWindow = new Date(Date.now() - 60 * 60 * 1000); // 60 min
  const shortWindow = new Date(Date.now() - 15 * 60 * 1000);   // 15 min

  const [result] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE attempted_at > ${shortWindow})::int as failures_15m,
      COUNT(*) FILTER (WHERE attempted_at > ${longestWindow})::int as failures_60m
    FROM login_attempts
    WHERE email = ${normalizedEmail}
      AND success = false
      AND attempted_at > ${longestWindow}
  `;

  // Check strictest threshold first
  if (result.failures_60m >= LOCKOUT_THRESHOLDS[1].failures) {
    return { locked: true, lockoutMinutes: 60, failureCount: result.failures_60m };
  }
  if (result.failures_15m >= LOCKOUT_THRESHOLDS[0].failures) {
    return { locked: true, lockoutMinutes: 15, failureCount: result.failures_15m };
  }

  return { locked: false, lockoutMinutes: 0, failureCount: result.failures_15m };
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
