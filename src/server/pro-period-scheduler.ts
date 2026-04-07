import sql from './db.ts';
import { expireProPeriod, createProPeriod } from './pro-periods.ts';
import { getBetaEndDate } from './platform-settings.ts';
import { sendEmail, buildProTrialWarningEmail, buildBetaExpirationWarningEmail, buildProPeriodExpiredEmail } from './email.ts';
import { createNotification } from './notifications.ts';
import logger, { sanitizeError } from './logger.ts';

/**
 * Process pro period expirations, warnings, and beta→founding transitions.
 * Runs daily.
 */
export async function processProPeriods(): Promise<{
  expired: number;
  warned14d: number;
  warned7d: number;
  warned1d: number;
  transitioned: number;
}> {
  let expired = 0;
  let warned14d = 0;
  let warned7d = 0;
  let warned1d = 0;
  let transitioned = 0;

  try {
    // 1. Expire overdue periods
    const overdue = await sql`
      SELECT pp.id, pp.user_id, pp.source, u.email, u.name, u.founding_sitter
      FROM pro_periods pp
      JOIN users u ON u.id = pp.user_id
      WHERE pp.status = 'active' AND pp.ends_at <= NOW()
    `.catch(() => [] as any[]);

    for (const period of overdue) {
      try {
        await sql.begin(async (tx: any) => {
          await expireProPeriod(period.id, tx);

          // Beta → founding transition: create 6-month free Pro period
          if (period.source === 'beta' && period.founding_sitter) {
            const sixMonthsFromNow = new Date();
            sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);
            await createProPeriod(period.user_id, 'beta_transition', sixMonthsFromNow, tx);
            transitioned++;
            logger.info({ userId: period.user_id }, 'Founding sitter transitioned to 6-month free Pro');
          }
        });

        // Send expiration email (best-effort, outside transaction)
        const wasUpgraded = period.source === 'beta' && period.founding_sitter;
        if (!wasUpgraded) {
          const emailContent = buildProPeriodExpiredEmail({
            userName: period.name,
            source: period.source,
          });
          sendEmail({ to: period.email, ...emailContent }).catch(() => {});

          createNotification(
            period.user_id,
            'account_update',
            'Pro period ended',
            'Your free Pro access has ended. Upgrade to keep 0% platform fees.',
          ).catch(() => {});
        }

        expired++;
      } catch (err) {
        logger.warn({ err: sanitizeError(err), periodId: period.id }, 'Failed to expire pro period');
      }
    }

    // 2. Send 14-day warnings (beta periods only)
    const warn14d = await sql`
      SELECT pp.id, pp.user_id, pp.source, pp.ends_at, u.email, u.name, u.founding_sitter
      FROM pro_periods pp
      JOIN users u ON u.id = pp.user_id
      WHERE pp.status = 'active'
        AND pp.source IN ('beta', 'beta_transition')
        AND pp.ends_at <= NOW() + INTERVAL '14 days'
        AND pp.ends_at > NOW()
        AND pp.warning_14d_sent_at IS NULL
    `.catch(() => [] as any[]);

    for (const period of warn14d) {
      try {
        const daysRemaining = Math.ceil((new Date(period.ends_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
        const emailContent = buildBetaExpirationWarningEmail({
          sitterName: period.name,
          daysRemaining,
          betaEndDate: new Date(period.ends_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
          isFounding: period.founding_sitter,
        });
        await sendEmail({ to: period.email, ...emailContent });
        await sql`UPDATE pro_periods SET warning_14d_sent_at = NOW() WHERE id = ${period.id}`;

        createNotification(
          period.user_id,
          'account_update',
          `${daysRemaining} days left in your ${period.source === 'beta' ? 'beta' : 'free Pro'} period`,
          period.founding_sitter
            ? "Your beta period is ending soon. As a Founding Sitter, you'll receive 6 months of free Pro."
            : 'Your free Pro access is ending soon. Subscribe to keep 0% platform fees.',
        ).catch(() => {});

        warned14d++;
      } catch (err) {
        logger.warn({ err: sanitizeError(err), periodId: period.id }, 'Failed to send 14d warning');
      }
    }

    // 3. Send 7-day warnings (all period types)
    const warn7d = await sql`
      SELECT pp.id, pp.user_id, pp.source, pp.ends_at, u.email, u.name
      FROM pro_periods pp
      JOIN users u ON u.id = pp.user_id
      WHERE pp.status = 'active'
        AND pp.ends_at <= NOW() + INTERVAL '7 days'
        AND pp.ends_at > NOW()
        AND pp.warning_7d_sent_at IS NULL
    `.catch(() => [] as any[]);

    for (const period of warn7d) {
      try {
        const daysRemaining = Math.ceil((new Date(period.ends_at).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
        const emailContent = buildProTrialWarningEmail({
          sitterName: period.name,
          daysRemaining,
          trialEndDate: new Date(period.ends_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        });
        await sendEmail({ to: period.email, ...emailContent });
        await sql`UPDATE pro_periods SET warning_7d_sent_at = NOW() WHERE id = ${period.id}`;

        createNotification(
          period.user_id,
          'account_update',
          `${daysRemaining} days left of free Pro`,
          'Subscribe to Pro ($19.99/mo) to keep 0% platform fees and priority search placement.',
        ).catch(() => {});

        warned7d++;
      } catch (err) {
        logger.warn({ err: sanitizeError(err), periodId: period.id }, 'Failed to send 7d warning');
      }
    }

    // 4. Send 1-day warnings
    const warn1d = await sql`
      SELECT pp.id, pp.user_id, pp.source, pp.ends_at, u.email, u.name
      FROM pro_periods pp
      JOIN users u ON u.id = pp.user_id
      WHERE pp.status = 'active'
        AND pp.ends_at <= NOW() + INTERVAL '1 day'
        AND pp.ends_at > NOW()
        AND pp.warning_1d_sent_at IS NULL
    `.catch(() => [] as any[]);

    for (const period of warn1d) {
      try {
        const emailContent = buildProTrialWarningEmail({
          sitterName: period.name,
          daysRemaining: 1,
          trialEndDate: new Date(period.ends_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        });
        await sendEmail({ to: period.email, ...emailContent });
        await sql`UPDATE pro_periods SET warning_1d_sent_at = NOW() WHERE id = ${period.id}`;

        createNotification(
          period.user_id,
          'account_update',
          'Last day of free Pro!',
          'Your free Pro access ends tomorrow. Subscribe now to avoid the 15% platform fee.',
        ).catch(() => {});

        warned1d++;
      } catch (err) {
        logger.warn({ err: sanitizeError(err), periodId: period.id }, 'Failed to send 1d warning');
      }
    }
  } catch (err) {
    logger.error({ err: sanitizeError(err) }, 'Pro period scheduler failed');
  }

  return { expired, warned14d, warned7d, warned1d, transitioned };
}

let intervalId: ReturnType<typeof setInterval> | null = null;
let timeoutId: ReturnType<typeof setTimeout> | null = null;

export function startProPeriodScheduler(): void {
  if (intervalId) return;
  // Run daily (24 hours)
  intervalId = setInterval(() => processProPeriods(), 24 * 60 * 60 * 1000);
  // Initial check after 5 minutes
  timeoutId = setTimeout(() => processProPeriods(), 5 * 60 * 1000);
  logger.info('Pro period scheduler started (daily)');
}

export function stopProPeriodScheduler(): void {
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
  if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
  logger.info('Pro period scheduler stopped');
}
