import sql from './db.ts';
import { sendEmail, buildCreditLowWarningEmail } from './email.ts';
import logger, { sanitizeError } from './logger.ts';

const LOW_BALANCE_THRESHOLD_CENTS = 1000; // $10

/**
 * Check for sitters with low credit balances and send warning emails.
 * Runs daily. Only warns once every 25 days per sitter.
 */
export async function checkCreditLowWarnings(): Promise<number> {
  let sentCount = 0;

  try {
    // Find sitters with 0 < balance < $10, not warned in the last 25 days
    const sitters = await sql`
      SELECT u.id as sitter_id, u.email, u.name,
             COALESCE(SUM(cl.amount_cents), 0)::int as balance_cents
      FROM users u
      JOIN credit_ledger cl ON cl.user_id = u.id
        AND (cl.expires_at IS NULL OR cl.expires_at > NOW())
      WHERE u.roles @> '{sitter}'::text[]
        AND (u.credit_low_warning_sent_at IS NULL OR u.credit_low_warning_sent_at < NOW() - INTERVAL '25 days')
      GROUP BY u.id, u.email, u.name
      HAVING COALESCE(SUM(cl.amount_cents), 0) > 0
        AND COALESCE(SUM(cl.amount_cents), 0) < ${LOW_BALANCE_THRESHOLD_CENTS}
    `.catch(() => [] as any[]);

    for (const sitter of sitters) {
      try {
        const emailContent = buildCreditLowWarningEmail({
          sitterName: sitter.name,
          balanceCents: sitter.balance_cents,
          dashboardUrl: `${process.env.APP_URL || 'https://petlink.app'}/settings`,
        });

        sendEmail({
          to: sitter.email,
          ...emailContent,
        }).catch(() => {});

        // Mark as warned (idempotency: only update if not recently warned)
        await sql`
          UPDATE users SET credit_low_warning_sent_at = NOW()
          WHERE id = ${sitter.sitter_id}
            AND (credit_low_warning_sent_at IS NULL OR credit_low_warning_sent_at < NOW() - INTERVAL '25 days')
        `.catch(() => {});

        sentCount++;
      } catch (err) {
        logger.warn({ err: sanitizeError(err), sitterId: sitter.sitter_id }, 'Failed to send credit low warning');
        sentCount++;
      }
    }
  } catch (err) {
    logger.error({ err: sanitizeError(err) }, 'Credit low warning check failed');
  }

  return sentCount;
}

let intervalId: ReturnType<typeof setInterval> | null = null;
let timeoutId: ReturnType<typeof setTimeout> | null = null;

export function startCreditLowWarningScheduler(): void {
  if (intervalId) return;
  // Run daily (24 hours)
  intervalId = setInterval(() => checkCreditLowWarnings(), 24 * 60 * 60 * 1000);
  // Initial check after 2 minutes
  timeoutId = setTimeout(() => checkCreditLowWarnings(), 120 * 1000);
  logger.info('Credit low warning scheduler started (daily)');
}

export function stopCreditLowWarningScheduler(): void {
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
  if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
  logger.info('Credit low warning scheduler stopped');
}
