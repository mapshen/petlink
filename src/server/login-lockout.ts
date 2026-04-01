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

/** Check if an email is currently locked out */
export async function checkLockout(email: string): Promise<LockoutStatus> {
  const normalizedEmail = email.toLowerCase().trim();

  // Check thresholds from strictest to most lenient
  for (const threshold of [...LOCKOUT_THRESHOLDS].reverse()) {
    const [result] = await sql`
      SELECT COUNT(*)::int as failure_count
      FROM login_attempts
      WHERE email = ${normalizedEmail}
        AND success = false
        AND attempted_at > NOW() - INTERVAL '${sql.unsafe(String(threshold.windowMinutes))} minutes'
    `;
    if (result.failure_count >= threshold.failures) {
      return { locked: true, lockoutMinutes: threshold.lockoutMinutes, failureCount: result.failure_count };
    }
  }

  // Get failure count for alert checking
  const [shortWindow] = await sql`
    SELECT COUNT(*)::int as failure_count
    FROM login_attempts
    WHERE email = ${normalizedEmail}
      AND success = false
      AND attempted_at > NOW() - INTERVAL '${sql.unsafe(String(LOCKOUT_THRESHOLDS[0].windowMinutes))} minutes'
  `;

  return { locked: false, lockoutMinutes: 0, failureCount: shortWindow.failure_count };
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
    `.catch(() => {});
  }

  // Cleanup: delete attempts older than 24 hours (prevents table bloat)
  await sql`
    DELETE FROM login_attempts
    WHERE attempted_at < NOW() - INTERVAL '24 hours'
  `.catch(() => {});

  // Return current failure count for alert checking
  if (!success) {
    const [result] = await sql`
      SELECT COUNT(*)::int as failure_count
      FROM login_attempts
      WHERE email = ${normalizedEmail}
        AND success = false
        AND attempted_at > NOW() - INTERVAL '15 minutes'
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
export async function clearLockout(email: string): Promise<void> {
  const normalizedEmail = email.toLowerCase().trim();
  await sql`
    DELETE FROM login_attempts
    WHERE email = ${normalizedEmail} AND success = false
  `;
  logger.info({ email: normalizedEmail }, 'Login lockout cleared by admin');
}
