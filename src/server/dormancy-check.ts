import sql from './db.ts';
import { sendEmail, buildDormancyWarningEmail, buildDormancyForfeitureEmail } from './email.ts';
import logger, { sanitizeError } from './logger.ts';

const WARNING_MONTHS = 35;
const FORFEITURE_MONTHS = 36;
const WARNING_TO_FORFEITURE_DAYS = 30;

/**
 * Check for dormant accounts and handle warning/forfeiture.
 * Phase 1: Warn users inactive 35+ months with credit balance (haven't been warned yet).
 * Phase 2: Forfeit credits for users inactive 36+ months who were warned 30+ days ago.
 */
export async function checkDormancy(): Promise<{ warned: number; forfeited: number }> {
  let warned = 0;
  let forfeited = 0;

  try {
    // Phase 1: Warning — inactive 35+ months, has balance, not yet warned
    const warningUsers = await sql`
      SELECT u.id as user_id, u.email, u.name,
             COALESCE(SUM(cl.amount_cents), 0)::int as balance_cents
      FROM users u
      JOIN credit_ledger cl ON cl.user_id = u.id
        AND (cl.expires_at IS NULL OR cl.expires_at > NOW())
      WHERE u.last_active_at IS NOT NULL
        AND u.last_active_at < NOW() - INTERVAL '${sql.unsafe(String(WARNING_MONTHS))} months'
        AND u.dormancy_warning_sent_at IS NULL
      GROUP BY u.id, u.email, u.name
      HAVING COALESCE(SUM(cl.amount_cents), 0) > 0
    `.catch(() => [] as any[]);

    for (const user of warningUsers) {
      try {
        const emailContent = buildDormancyWarningEmail({
          userName: user.name,
          balanceCents: user.balance_cents,
          reactivationDeadline: new Date(Date.now() + WARNING_TO_FORFEITURE_DAYS * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
          loginUrl: `${process.env.APP_URL || 'https://petlink.app'}/login`,
        });

        await sendEmail({ to: user.email, ...emailContent });

        await sql`
          UPDATE users SET dormancy_warning_sent_at = NOW()
          WHERE id = ${user.user_id} AND dormancy_warning_sent_at IS NULL
        `.catch(() => {});

        warned++;
      } catch (err) {
        logger.warn({ err: sanitizeError(err), userId: user.user_id }, 'Failed to send dormancy warning');
      }
    }

    // Phase 2: Forfeiture — inactive 36+ months, warned 30+ days ago, still has balance
    const forfeitureUsers = await sql`
      SELECT u.id as user_id, u.email, u.name,
             COALESCE(SUM(cl.amount_cents), 0)::int as balance_cents
      FROM users u
      JOIN credit_ledger cl ON cl.user_id = u.id
        AND (cl.expires_at IS NULL OR cl.expires_at > NOW())
      WHERE u.last_active_at IS NOT NULL
        AND u.last_active_at < NOW() - INTERVAL '${sql.unsafe(String(FORFEITURE_MONTHS))} months'
        AND u.dormancy_warning_sent_at IS NOT NULL
        AND u.dormancy_warning_sent_at < NOW() - INTERVAL '${sql.unsafe(String(WARNING_TO_FORFEITURE_DAYS))} days'
        AND NOT EXISTS (
          SELECT 1 FROM dormancy_forfeiture_log dfl
          WHERE dfl.user_id = u.id AND dfl.forfeited_at > u.dormancy_warning_sent_at
        )
      GROUP BY u.id, u.email, u.name
      HAVING COALESCE(SUM(cl.amount_cents), 0) > 0
    `.catch(() => [] as any[]);

    for (const user of forfeitureUsers) {
      try {
        // Recalculate balance inside transaction to prevent TOCTOU race
        let actualBalance = 0;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await sql.begin(async (tx: any) => {
          const [{ balance }] = await tx`
            SELECT COALESCE(SUM(amount_cents), 0)::int as balance
            FROM credit_ledger
            WHERE user_id = ${user.user_id}
              AND (expires_at IS NULL OR expires_at > NOW())
          `;
          if (balance <= 0) return; // User redeemed credits since the outer query
          actualBalance = balance;

          const [entry] = await tx`
            INSERT INTO credit_ledger (user_id, amount_cents, type, source_type, description)
            VALUES (${user.user_id}, ${-balance}, 'dormancy_forfeiture', 'system',
                    ${'Dormancy forfeiture — account inactive for ' + FORFEITURE_MONTHS + '+ months'})
            RETURNING id
          `;

          await tx`
            INSERT INTO dormancy_forfeiture_log (user_id, amount_cents, credit_ledger_entry_id)
            VALUES (${user.user_id}, ${balance}, ${entry.id})
          `;
        });

        if (actualBalance <= 0) continue; // Skip email if nothing was forfeited

        // Send confirmation email (best-effort, outside transaction)
        const emailContent = buildDormancyForfeitureEmail({
          userName: user.name,
          forfeitedAmountCents: actualBalance,
        });
        sendEmail({ to: user.email, ...emailContent }).catch(() => {});

        forfeited++;
        logger.info({ userId: user.user_id, amountCents: user.balance_cents }, 'Credits forfeited due to dormancy');
      } catch (err) {
        logger.error({ err: sanitizeError(err), userId: user.user_id }, 'Failed to forfeit dormant credits');
      }
    }
  } catch (err) {
    logger.error({ err: sanitizeError(err) }, 'Dormancy check failed');
  }

  return { warned, forfeited };
}

let intervalId: ReturnType<typeof setInterval> | null = null;
let timeoutId: ReturnType<typeof setTimeout> | null = null;

export function startDormancyCheckScheduler(): void {
  if (intervalId) return;
  // Run daily (24 hours)
  intervalId = setInterval(() => checkDormancy(), 24 * 60 * 60 * 1000);
  // Initial check after 5 minutes
  timeoutId = setTimeout(() => checkDormancy(), 5 * 60 * 1000);
  logger.info('Dormancy check scheduler started (daily)');
}

export function stopDormancyCheckScheduler(): void {
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
  if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
  logger.info('Dormancy check scheduler stopped');
}
