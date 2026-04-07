import type { Router } from 'express';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { validate, createReviewSchema, reviewResponseSchema, reportReviewSchema } from '../validation.ts';
import logger, { sanitizeError } from '../logger.ts';
import { issueReviewCredit } from '../review-incentives.ts';

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

export default function reviewRoutes(router: Router): void {
  router.post('/reviews', authMiddleware, validate(createReviewSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const {
        booking_id, rating, comment,
        pet_care_rating, communication_rating, reliability_rating,
        pet_accuracy_rating, preparedness_rating,
        private_flags, private_note,
      } = req.body;

      const [booking] = await sql`SELECT id, owner_id, sitter_id, status, end_time FROM bookings WHERE id = ${booking_id}`;
      if (!booking) {
        res.status(404).json({ error: 'Booking not found' });
        return;
      }

      if (booking.status !== 'completed') {
        res.status(400).json({ error: 'Can only review completed bookings' });
        return;
      }

      // 30-day absolute review deadline from booking end time
      const REVIEW_DEADLINE_MS = 30 * 24 * 60 * 60 * 1000;
      const bookingAge = Date.now() - new Date(booking.end_time).getTime();
      if (bookingAge > REVIEW_DEADLINE_MS) {
        res.status(403).json({ error: 'The review period for this booking has expired (30 days)' });
        return;
      }

      const isOwner = booking.owner_id === req.userId;
      const isSitter = booking.sitter_id === req.userId;
      if (!isOwner && !isSitter) {
        res.status(403).json({ error: 'Not part of this booking' });
        return;
      }

      const revieweeId = isOwner ? booking.sitter_id : booking.owner_id;

      const [existing] = await sql`SELECT id FROM reviews WHERE booking_id = ${booking_id} AND reviewer_id = ${req.userId}`;
      if (existing) {
        res.status(409).json({ error: 'You have already reviewed this booking' });
        return;
      }

      // Block reviews after 3-day window if the other party already reviewed (prevents retaliation)
      const [otherReview] = await sql`SELECT id, created_at FROM reviews WHERE booking_id = ${booking_id} AND reviewer_id = ${revieweeId}`;
      if (otherReview) {
        const otherAge = Date.now() - new Date(otherReview.created_at).getTime();
        if (otherAge > THREE_DAYS_MS) {
          res.status(403).json({ error: 'The review window for this booking has closed' });
          return;
        }
      }

      // Filter sub-ratings by reviewer type: owners rate sitter attributes, sitters rate owner attributes
      const ownerSubRatings = isOwner
        ? { pet_care: pet_care_rating ?? null, comm: communication_rating ?? null, reliability: reliability_rating ?? null }
        : { pet_care: null, comm: null, reliability: null };
      const sitterSubRatings = isSitter
        ? { accuracy: pet_accuracy_rating ?? null, comm: communication_rating ?? null, prep: preparedness_rating ?? null }
        : { accuracy: null, comm: null, prep: null };

      const flagsArray = Array.isArray(private_flags) && private_flags.length > 0 ? private_flags : [];

      const [review] = await sql`
        INSERT INTO reviews (
          booking_id, reviewer_id, reviewee_id, rating, comment,
          pet_care_rating, communication_rating, reliability_rating,
          pet_accuracy_rating, preparedness_rating,
          private_flags, private_note
        )
        VALUES (
          ${booking_id}, ${req.userId}, ${revieweeId}, ${rating}, ${comment || null},
          ${ownerSubRatings.pet_care}, ${isOwner ? ownerSubRatings.comm : sitterSubRatings.comm},
          ${ownerSubRatings.reliability}, ${sitterSubRatings.accuracy}, ${sitterSubRatings.prep},
          ${flagsArray}, ${private_note || null}
        )
        RETURNING id
      `;

      if (otherReview) {
        await sql`UPDATE reviews SET published_at = NOW() WHERE booking_id = ${booking_id} AND published_at IS NULL`;
      }

      // Issue credit reward for reviews with a comment (FTC-compliant: rewards writing, not positivity)
      let creditResult = null;
      if (isOwner && comment) {
        creditResult = await issueReviewCredit(req.userId!, booking_id);
      }

      res.status(201).json({ id: review.id, credit: creditResult });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to create review');
      res.status(500).json({ error: 'Failed to create review' });
    }
  });

  // Get review state for a specific booking (both reviews + permissions)
  // Must be registered before /reviews/:userId to avoid "booking" matching as a userId
  router.get('/reviews/booking/:bookingId', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const bookingId = parseInt(req.params.bookingId, 10);
      if (isNaN(bookingId)) {
        res.status(400).json({ error: 'Invalid booking ID' });
        return;
      }

      const [booking] = await sql`SELECT owner_id, sitter_id, status, end_time FROM bookings WHERE id = ${bookingId}`;
      if (!booking) {
        res.status(404).json({ error: 'Booking not found' });
        return;
      }

      const isOwner = booking.owner_id === req.userId;
      const isSitter = booking.sitter_id === req.userId;
      if (!isOwner && !isSitter) {
        res.status(403).json({ error: 'Not part of this booking' });
        return;
      }

      // Fetch all reviews for this booking
      const allReviews = await sql`
        SELECT r.*,
          reviewer.name as reviewer_name, reviewer.avatar_url as reviewer_avatar,
          reviewee.name as reviewee_name, reviewee.avatar_url as reviewee_avatar,
          s.type as service_type
        FROM reviews r
        JOIN users reviewer ON r.reviewer_id = reviewer.id
        JOIN users reviewee ON r.reviewee_id = reviewee.id
        JOIN bookings b ON r.booking_id = b.id
        LEFT JOIN services s ON b.service_id = s.id
        WHERE r.booking_id = ${bookingId}
        ORDER BY r.created_at ASC
      `;

      // Filter visibility: show own reviews always, show other's only if published
      // Hidden reviews still appear but with redacted content
      const visibleReviews = allReviews.filter((r: { reviewer_id: number; published_at: string | null; created_at: string }) => {
        if (r.reviewer_id === req.userId) return true;
        const isPublished = r.published_at !== null || (Date.now() - new Date(r.created_at).getTime()) > THREE_DAYS_MS;
        return isPublished;
      });

      // Determine can_review (ignore hidden reviews for this calculation)
      const nonHiddenReviews = allReviews.filter((r: { hidden_at: string | null }) => !r.hidden_at);
      const userReview = nonHiddenReviews.find((r: { reviewer_id: number }) => r.reviewer_id === req.userId);
      const otherReview = nonHiddenReviews.find((r: { reviewer_id: number }) => r.reviewer_id !== req.userId);
      let canReview = false;
      const REVIEW_DEADLINE_MS = 30 * 24 * 60 * 60 * 1000;
      const bookingExpired = booking.end_time ? Date.now() - new Date(booking.end_time).getTime() > REVIEW_DEADLINE_MS : false;
      if (booking.status === 'completed' && !userReview && !bookingExpired) {
        if (!otherReview) {
          canReview = true;
        } else {
          const otherAge = Date.now() - new Date(otherReview.created_at).getTime();
          canReview = otherAge <= THREE_DAYS_MS;
        }
      }

      // Determine can_respond per review (only for non-hidden reviews where current user is the reviewee)
      const canRespond: Record<number, boolean> = {};
      for (const r of visibleReviews) {
        if (r.reviewee_id === req.userId && r.response_text === null && !r.hidden_at) {
          const isPublished = r.published_at !== null || (Date.now() - new Date(r.created_at).getTime()) > THREE_DAYS_MS;
          canRespond[r.id] = isPublished;
        }
      }

      // Mark own unpublished reviews with a pending flag for the frontend
      // Redact hidden reviews to show placeholder
      // Strip private_flags and private_note from public responses
      const reviews = visibleReviews.map((r: { reviewer_id: number; published_at: string | null; created_at: string; hidden_at: string | null; private_flags?: string[]; private_note?: string | null }) => {
        const { private_flags: _pf, private_note: _pn, ...rest } = r;
        const base = {
          ...rest,
          is_pending: r.reviewer_id === req.userId && r.published_at === null && (Date.now() - new Date(r.created_at).getTime()) <= THREE_DAYS_MS,
        };
        if (r.hidden_at) {
          return { ...base, comment: null, is_hidden: true };
        }
        return base;
      });

      res.json({ reviews, can_review: canReview, can_respond: canRespond });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch booking reviews');
      res.status(500).json({ error: 'Failed to fetch booking reviews' });
    }
  });

  // Get reviews for a user (only published ones)
  // Optional ?role=owner filter: only show reviews where the reviewee is an owner (sitter→owner reviews)
  router.get('/reviews/:userId', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const roleFilter = req.query.role as string | undefined;
      if (roleFilter && roleFilter !== 'owner' && roleFilter !== 'sitter') {
        res.status(400).json({ error: 'Invalid role filter. Must be "owner" or "sitter".' });
        return;
      }

      const rawReviews = await sql`
        SELECT r.*, u.name as reviewer_name, u.avatar_url as reviewer_avatar
        FROM reviews r
        JOIN users u ON r.reviewer_id = u.id
        WHERE r.reviewee_id = ${req.params.userId}
          AND r.hidden_at IS NULL
          AND (r.published_at IS NOT NULL OR r.created_at < NOW() - INTERVAL '3 days')
          ${roleFilter === 'owner' ? sql`AND r.pet_accuracy_rating IS NOT NULL` : sql``}
          ${roleFilter === 'sitter' ? sql`AND r.pet_care_rating IS NOT NULL` : sql``}
        ORDER BY r.created_at DESC
      `;

      // Strip private_flags and private_note from public responses
      const reviews = rawReviews.map((r: { private_flags?: string[]; private_note?: string | null }) => {
        const { private_flags: _pf, private_note: _pn, ...rest } = r;
        return rest;
      });

      res.json({ reviews });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch user reviews');
      res.status(500).json({ error: 'Failed to fetch user reviews' });
    }
  });

  // Report a review (any authenticated user, not the reviewer)
  router.post('/reviews/:id/report', authMiddleware, validate(reportReviewSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const reviewId = parseInt(req.params.id, 10);
      if (isNaN(reviewId)) {
        res.status(400).json({ error: 'Invalid review ID' });
        return;
      }

      const [review] = await sql`SELECT id, reviewer_id, hidden_at FROM reviews WHERE id = ${reviewId}`;
      if (!review) {
        res.status(404).json({ error: 'Review not found' });
        return;
      }

      if (review.reviewer_id === req.userId) {
        res.status(403).json({ error: 'You cannot report your own review' });
        return;
      }

      if (review.hidden_at) {
        res.status(400).json({ error: 'This review has already been removed' });
        return;
      }

      const [existing] = await sql`SELECT id FROM review_reports WHERE review_id = ${reviewId} AND reporter_id = ${req.userId}`;
      if (existing) {
        res.status(409).json({ error: 'You have already reported this review' });
        return;
      }

      const { reason, description } = req.body;
      const [report] = await sql`
        INSERT INTO review_reports (review_id, reporter_id, reason, description)
        VALUES (${reviewId}, ${req.userId}, ${reason}, ${description || null})
        RETURNING id, review_id, reason, status, created_at
      `;

      res.status(201).json({ report });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to report review');
      res.status(500).json({ error: 'Failed to report review' });
    }
  });

  // Respond to a review (only reviewee can respond, only after published)
  router.put('/reviews/:id/respond', authMiddleware, validate(reviewResponseSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const reviewId = parseInt(req.params.id, 10);
      if (isNaN(reviewId)) {
        res.status(400).json({ error: 'Invalid review ID' });
        return;
      }

      const [review] = await sql`SELECT * FROM reviews WHERE id = ${reviewId}`;
      if (!review) {
        res.status(404).json({ error: 'Review not found' });
        return;
      }

      if (review.hidden_at) {
        res.status(400).json({ error: 'Cannot respond to a removed review' });
        return;
      }

      if (review.reviewee_id !== req.userId) {
        res.status(403).json({ error: 'Only the person being reviewed can respond' });
        return;
      }

      if (review.response_text !== null) {
        res.status(409).json({ error: 'You have already responded to this review' });
        return;
      }

      const isPublished = review.published_at !== null || (Date.now() - new Date(review.created_at).getTime()) > THREE_DAYS_MS;
      if (!isPublished) {
        res.status(403).json({ error: 'Cannot respond to a review that is not yet visible' });
        return;
      }

      const { response_text } = req.body;
      const [updated] = await sql`
        UPDATE reviews SET response_text = ${response_text}, response_at = NOW()
        WHERE id = ${reviewId} AND response_text IS NULL
        RETURNING *
      `;

      if (!updated) {
        res.status(409).json({ error: 'You have already responded to this review' });
        return;
      }

      res.json({ review: updated });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to respond to review');
      res.status(500).json({ error: 'Failed to respond to review' });
    }
  });
}
