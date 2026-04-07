import sql from './db.ts';
import { createNotification } from './notifications.ts';
import logger, { sanitizeError } from './logger.ts';

/** Pre-loaded common recurring expense templates for sitters. */
export const COMMON_RECURRING_TEMPLATES = [
  { category: 'insurance', description: 'Pet sitter insurance', amount_cents: 4500 },
  { category: 'insurance', description: 'Liability insurance', amount_cents: 3500 },
  { category: 'transportation', description: 'Car payment', amount_cents: 35000 },
  { category: 'transportation', description: 'Gas / fuel', amount_cents: 15000 },
  { category: 'supplies', description: 'Supplies subscription', amount_cents: 2500 },
  { category: 'equipment', description: 'Software subscription', amount_cents: 999 },
  { category: 'marketing', description: 'Marketing / ads', amount_cents: 5000 },
  { category: 'training', description: 'Continuing education', amount_cents: 2000 },
] as const;

/**
 * Process recurring expense templates: create expense entries for active
 * templates whose day_of_month matches today.
 *
 * Uses source_reference with ON CONFLICT for idempotency — safe to run
 * multiple times on the same day.
 */
export async function processRecurringExpenses(): Promise<{ generated: number }> {
  let generated = 0;
  const sitterCounts = new Map<number, number>();

  try {
    const today = new Date();
    const dayOfMonth = today.getDate();
    const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD
    const yearMonth = dateStr.slice(0, 7); // YYYY-MM

    // Find all active recurring templates where day_of_month matches today
    const templates = await sql`
      SELECT id, sitter_id, category, amount_cents, description, day_of_month
      FROM recurring_expenses
      WHERE active = true AND day_of_month = ${dayOfMonth}
    `.catch(() => [] as any[]);

    for (const template of templates) {
      try {
        const sourceRef = `recurring:${template.id}:${yearMonth}`;

        const result = await sql`
          INSERT INTO sitter_expenses (sitter_id, category, amount_cents, description, date, auto_logged, source_reference)
          VALUES (${template.sitter_id}, ${template.category}, ${template.amount_cents},
                  ${template.description ?? null}, ${dateStr}, true, ${sourceRef})
          ON CONFLICT (source_reference) WHERE source_reference IS NOT NULL DO NOTHING
          RETURNING id
        `;

        if (result.length > 0) {
          generated++;
          sitterCounts.set(
            template.sitter_id,
            (sitterCounts.get(template.sitter_id) || 0) + 1,
          );
        }
      } catch (err) {
        logger.warn(
          { err: sanitizeError(err), templateId: template.id },
          'Failed to generate expense from recurring template',
        );
      }
    }

    // Send grouped notifications per sitter
    for (const [sitterId, count] of sitterCounts) {
      const monthName = today.toLocaleString('en-US', { month: 'long' });
      createNotification(
        sitterId,
        'payment_update',
        `${count} recurring expense${count !== 1 ? 's' : ''} logged`,
        `${count} recurring expense${count !== 1 ? 's' : ''} auto-logged for ${monthName} — review them in your Wallet.`,
      ).catch(() => {});
    }

    if (generated > 0) {
      logger.info({ generated, sitters: sitterCounts.size }, 'Recurring expenses processed');
    }
  } catch (err) {
    logger.error({ err: sanitizeError(err) }, 'Recurring expense scheduler failed');
  }

  return { generated };
}

let intervalId: ReturnType<typeof setInterval> | null = null;
let timeoutId: ReturnType<typeof setTimeout> | null = null;

export function startRecurringExpenseScheduler(): void {
  if (intervalId) return;
  // Run daily (24 hours)
  intervalId = setInterval(() => processRecurringExpenses(), 24 * 60 * 60 * 1000);
  // Initial check after 5 minutes
  timeoutId = setTimeout(() => processRecurringExpenses(), 5 * 60 * 1000);
  logger.info('Recurring expense scheduler started (daily)');
}

export function stopRecurringExpenseScheduler(): void {
  if (intervalId) { clearInterval(intervalId); intervalId = null; }
  if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
  logger.info('Recurring expense scheduler stopped');
}
