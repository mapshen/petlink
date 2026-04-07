import sql from './db.ts';
import { issueCredit } from './credits.ts';
import logger, { sanitizeError } from './logger.ts';
import { dollarsToCents } from '../lib/money.ts';

/** $5 credit for a user's first-ever review (with comment). */
export const FIRST_REVIEW_BONUS_CENTS = dollarsToCents(5);

/** $2 credit for each subsequent review (with comment). */
export const SUBSEQUENT_REVIEW_CREDIT_CENTS = dollarsToCents(2);

interface ReviewCreditResult {
  readonly credited: boolean;
  readonly amountCents: number;
  readonly isFirstReview: boolean;
}

/**
 * Issue a credit reward for leaving a review.
 * First review earns a larger bonus; subsequent reviews earn a smaller credit.
 * Only reviews with a comment qualify (FTC compliance — incentivizes writing, not positivity).
 */
export async function issueReviewCredit(
  userId: number,
  bookingId: number
): Promise<ReviewCreditResult> {
  let isFirstReview = false;

  try {
    const [{ count }] = await sql`
      SELECT count(*)::int AS count
      FROM reviews
      WHERE reviewer_id = ${userId}
        AND comment IS NOT NULL
    `;

    // count includes the review just inserted, so first review = count was 0 before insert
    // but we call this after insert, so count >= 1 means the just-inserted one.
    // We check count <= 1 to mean "this is the first review with a comment"
    isFirstReview = count <= 1;

    const amountCents = isFirstReview ? FIRST_REVIEW_BONUS_CENTS : SUBSEQUENT_REVIEW_CREDIT_CENTS;
    const description = isFirstReview
      ? 'First review bonus — thank you for sharing your experience!'
      : 'Review credit — thanks for helping the PetLink community!';

    await issueCredit(userId, amountCents, 'milestone', 'booking', description, bookingId, undefined);

    logger.info({ userId, bookingId, amountCents, isFirstReview }, 'Review credit issued');
    return { credited: true, amountCents, isFirstReview };
  } catch (err) {
    logger.warn({ err: sanitizeError(err), userId, bookingId }, 'Failed to issue review credit');
    return { credited: false, amountCents: 0, isFirstReview };
  }
}
