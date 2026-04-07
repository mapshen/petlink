import type { Router } from 'express';
import sql from '../db.ts';
import { type AuthenticatedRequest } from '../auth.ts';
import { validate, reviewReportDecisionSchema } from '../validation.ts';
import { adminMiddleware } from '../admin.ts';
import logger, { sanitizeError } from '../logger.ts';

export default function reviewModerationRoutes(router: Router): void {
  // Admin: get review reports queue (paginated, filterable by status)
  router.get('/admin/review-reports', adminMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const status = req.query.status as string | undefined;
      const limit = Math.min(Number(req.query.limit) || 20, 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const validStatuses = ['pending', 'dismissed', 'actioned'];
      const statusFilter = status && validStatuses.includes(status) ? status : undefined;

      const reports = await sql`
        SELECT rr.*,
          r.rating as review_rating, r.comment as review_comment,
          r.reviewer_id, r.reviewee_id, r.hidden_at as review_hidden_at,
          reporter.name as reporter_name, reporter.email as reporter_email,
          reviewer.name as reviewer_name, reviewer.email as reviewer_email,
          reviewee.name as reviewee_name
        FROM review_reports rr
        JOIN reviews r ON rr.review_id = r.id
        JOIN users reporter ON rr.reporter_id = reporter.id
        JOIN users reviewer ON r.reviewer_id = reviewer.id
        JOIN users reviewee ON r.reviewee_id = reviewee.id
        ${statusFilter ? sql`WHERE rr.status = ${statusFilter}` : sql``}
        ORDER BY rr.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

      const [{ total }] = await sql`
        SELECT count(*)::int as total FROM review_reports
        ${statusFilter ? sql`WHERE status = ${statusFilter}` : sql``}
      `;

      res.json({ reports, total });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch review reports');
      res.status(500).json({ error: 'Failed to fetch review reports' });
    }
  });

  // Admin: take action on a review report (dismiss, hide review, ban reviewer)
  router.put('/admin/review-reports/:id', adminMiddleware, validate(reviewReportDecisionSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const reportId = parseInt(req.params.id, 10);
      if (isNaN(reportId)) {
        res.status(400).json({ error: 'Invalid report ID' });
        return;
      }

      const [report] = await sql`
        SELECT rr.*, r.reviewer_id, r.hidden_at as review_hidden_at
        FROM review_reports rr
        JOIN reviews r ON rr.review_id = r.id
        WHERE rr.id = ${reportId}
      `;
      if (!report) {
        res.status(404).json({ error: 'Report not found' });
        return;
      }

      if (report.status !== 'pending') {
        res.status(400).json({ error: 'Report has already been reviewed' });
        return;
      }

      const { action } = req.body;

      if (action === 'dismiss') {
        const [updated] = await sql`
          UPDATE review_reports
          SET status = 'dismissed', admin_id = ${req.userId}, reviewed_at = NOW()
          WHERE id = ${reportId}
          RETURNING *
        `;
        res.json({ report: updated });
        return;
      }

      if (action === 'hide_review') {
        await sql.begin(async (tx: any) => {
          // Hide the review
          await tx`
            UPDATE reviews SET hidden_at = NOW(), hidden_by = ${req.userId}
            WHERE id = ${report.review_id} AND hidden_at IS NULL
          `;
          // Action this report
          await tx`
            UPDATE review_reports
            SET status = 'actioned', admin_id = ${req.userId}, reviewed_at = NOW()
            WHERE id = ${reportId}
          `;
          // Also action any other pending reports for the same review
          await tx`
            UPDATE review_reports
            SET status = 'actioned', admin_id = ${req.userId}, reviewed_at = NOW()
            WHERE review_id = ${report.review_id} AND status = 'pending' AND id != ${reportId}
          `;
        });

        const [updated] = await sql`SELECT * FROM review_reports WHERE id = ${reportId}`;
        res.json({ report: updated });
        return;
      }

      if (action === 'ban_reviewer') {
        await sql.begin(async (tx: any) => {
          // Hide ALL reviews by the reviewer
          await tx`
            UPDATE reviews SET hidden_at = NOW(), hidden_by = ${req.userId}
            WHERE reviewer_id = ${report.reviewer_id} AND hidden_at IS NULL
          `;
          // Action all pending reports for any of the reviewer's reviews
          await tx`
            UPDATE review_reports
            SET status = 'actioned', admin_id = ${req.userId}, reviewed_at = NOW()
            WHERE review_id IN (SELECT id FROM reviews WHERE reviewer_id = ${report.reviewer_id})
              AND status = 'pending'
          `;
          // Ban the user
          await tx`
            UPDATE users
            SET approval_status = 'banned'
            WHERE id = ${report.reviewer_id}
          `;
        });

        const [updated] = await sql`SELECT * FROM review_reports WHERE id = ${reportId}`;
        res.json({ report: updated, reviewer_banned: true });
        return;
      }

      res.status(400).json({ error: 'Invalid action' });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to process review report');
      res.status(500).json({ error: 'Failed to process review report' });
    }
  });

  // Admin: directly hide a review (without a report)
  router.put('/admin/reviews/:id/hide', adminMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const reviewId = parseInt(req.params.id, 10);
      if (isNaN(reviewId)) {
        res.status(400).json({ error: 'Invalid review ID' });
        return;
      }

      const [review] = await sql`SELECT id, hidden_at FROM reviews WHERE id = ${reviewId}`;
      if (!review) {
        res.status(404).json({ error: 'Review not found' });
        return;
      }

      if (review.hidden_at) {
        res.status(400).json({ error: 'Review is already hidden' });
        return;
      }

      const [updated] = await sql`
        UPDATE reviews SET hidden_at = NOW(), hidden_by = ${req.userId}
        WHERE id = ${reviewId}
        RETURNING id, hidden_at, hidden_by
      `;

      // Also action any pending reports for this review
      await sql`
        UPDATE review_reports
        SET status = 'actioned', admin_id = ${req.userId}, reviewed_at = NOW()
        WHERE review_id = ${reviewId} AND status = 'pending'
      `;

      res.json({ review: updated });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to hide review');
      res.status(500).json({ error: 'Failed to hide review' });
    }
  });
}
