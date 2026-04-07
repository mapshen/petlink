import type { Router } from 'express';
import sql from '../db.ts';
import { type AuthenticatedRequest } from '../auth.ts';
import { validate, approvalDecisionSchema, betaCreditSchema } from '../validation.ts';
import { adminMiddleware } from '../admin.ts';
import { sendEmail, buildApprovalStatusEmail, buildFoundingSitterWelcomeEmail } from '../email.ts';
import { createNotification } from '../notifications.ts';
import { issueCredit } from '../credits.ts';
import { clearLockout } from '../login-lockout.ts';
import { isBetaActive, getBetaEndDate, setSetting, getProTrialDays } from '../platform-settings.ts';
import { createProPeriod, cancelProPeriod, getActiveProPeriod, hasUsedTrial, markTrialUsed } from '../pro-periods.ts';
import logger, { sanitizeError } from '../logger.ts';
import type { BetaCohort } from '../../types.ts';

export default function adminRoutes(router: Router): void {
  router.get('/admin/pending-sitters', adminMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const sitters = await sql`
        SELECT id, email, name, roles, bio, avatar_url, created_at, approval_status,
               years_experience, home_type, has_yard, has_fenced_yard, has_own_pets, own_pets_description,
               accepted_species, skills
        FROM users
        WHERE approval_status = 'pending_approval' AND roles @> '{sitter}'::text[]
        ORDER BY created_at ASC
      `;
      res.json({ sitters });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch pending sitters');
      res.status(500).json({ error: 'Failed to fetch pending sitters' });
    }
  });

  router.get('/admin/sitters', adminMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const status = req.query.status as string | undefined;
      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const validStatuses = ['approved', 'pending_approval', 'rejected', 'banned', 'onboarding'];
      const statusFilter = status && validStatuses.includes(status) ? status : undefined;

      const sitters = await sql`
        SELECT u.id, u.email, u.name, u.roles, u.bio, u.avatar_url, u.created_at, u.approval_status, u.approved_at, u.approval_rejected_reason,
               u.years_experience, u.home_type, u.has_yard, u.has_fenced_yard, u.has_own_pets, u.own_pets_description,
               u.accepted_species, u.skills,
               (SELECT count(*)::int FROM sitter_references WHERE sitter_id = u.id AND status = 'completed') as reference_count,
               (SELECT count(*)::int FROM imported_reviews WHERE sitter_id = u.id AND imported_profile_id IS NULL) as manual_import_count
        FROM users u
        WHERE u.roles @> '{sitter}'::text[]
        ${statusFilter ? sql`AND u.approval_status = ${statusFilter}` : sql``}
        ORDER BY u.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
      const [{ total }] = await sql`
        SELECT count(*)::int as total FROM users
        WHERE roles @> '{sitter}'::text[]
        ${statusFilter ? sql`AND approval_status = ${statusFilter}` : sql``}
      `;
      res.json({ sitters, total });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch sitters');
      res.status(500).json({ error: 'Failed to fetch sitters' });
    }
  });

  router.put('/admin/sitters/:id/approval', adminMiddleware, validate(approvalDecisionSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const sitterId = Number(req.params.id);
      if (!sitterId || isNaN(sitterId)) {
        res.status(400).json({ error: 'Invalid sitter ID' });
        return;
      }
      const { status, reason } = req.body;

      if (sitterId === req.userId && (status === 'banned' || status === 'rejected')) {
        res.status(400).json({ error: 'Cannot ban or reject yourself' });
        return;
      }

      const [sitter] = await sql`SELECT id, email, name, roles, approval_status FROM users WHERE id = ${sitterId} AND roles @> '{sitter}'::text[]`;
      if (!sitter) {
        res.status(404).json({ error: 'Sitter not found' });
        return;
      }

      if (status === 'approved') {
        await sql`
          UPDATE users SET
            approval_status = 'approved',
            roles = CASE WHEN NOT (roles @> '{sitter}'::text[]) THEN array_append(roles, 'sitter') ELSE roles END,
            approved_by = ${req.userId}, approved_at = NOW(), approval_rejected_reason = NULL
          WHERE id = ${sitterId}
        `;
      } else if (status === 'banned') {
        await sql`
          UPDATE users SET approval_status = 'banned', approval_rejected_reason = ${reason || 'Banned by admin'}, approved_by = ${req.userId}, approved_at = NOW()
          WHERE id = ${sitterId}
        `;
      } else {
        await sql`
          UPDATE users SET approval_status = 'rejected', approval_rejected_reason = ${reason || null}, approved_by = ${req.userId}, approved_at = NOW()
          WHERE id = ${sitterId}
        `;
      }

      // Auto-enroll in beta or start free trial (transactional to prevent TOCTOU race)
      if (status === 'approved') {
        try {
          await sql.begin(async (tx: any) => {
            const [lockedUser] = await tx`SELECT pro_trial_used FROM users WHERE id = ${sitterId} FOR UPDATE`;
            const betaIsActive = await isBetaActive();
            if (betaIsActive) {
              const betaEnd = await getBetaEndDate();
              if (betaEnd && betaEnd > new Date()) {
                await createProPeriod(sitterId, 'beta', betaEnd, tx);
                logger.info({ sitterId }, 'Sitter auto-enrolled in beta program on approval');
              }
            } else if (!lockedUser.pro_trial_used) {
              const trialDays = await getProTrialDays();
              const trialEnd = new Date();
              trialEnd.setDate(trialEnd.getDate() + trialDays);
              await createProPeriod(sitterId, 'trial', trialEnd, tx);
              await markTrialUsed(sitterId, tx);
              logger.info({ sitterId, trialDays }, 'Free Pro trial started on sitter approval');
            }
          });
        } catch (err) {
          logger.warn({ err: sanitizeError(err), sitterId }, 'Failed to auto-enroll sitter in beta/trial');
        }
      }

      // Send in-app notification
      if (status === 'approved') {
        await createNotification(sitterId, 'account_update', 'Account Approved', 'Your sitter account has been approved! You can now receive bookings.');
      } else {
        await createNotification(sitterId, 'account_update', 'Account Not Approved', 'Your sitter application was not approved.', { reason: reason || undefined });
      }

      // Send email notification
      const email = buildApprovalStatusEmail({
        sitterName: sitter.name,
        status,
        reason,
      });
      await sendEmail({ to: sitter.email, ...email }).catch(() => {});

      const [updated] = await sql`
        SELECT id, email, name, roles, approval_status, approved_at, approval_rejected_reason
        FROM users WHERE id = ${sitterId}
      `;
      res.json({ sitter: updated });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to update sitter approval');
      res.status(500).json({ error: 'Failed to update sitter approval' });
    }
  });

  // Admin: issue beta promotional credits to a sitter
  router.post('/admin/users/:id/beta-credit', adminMiddleware, validate(betaCreditSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const sitterId = Number(req.params.id);
      if (!sitterId || isNaN(sitterId)) {
        res.status(400).json({ error: 'Invalid user ID' });
        return;
      }

      const { amount_cents, cohort } = req.body as { amount_cents: number; cohort: BetaCohort };

      // Validate amount is within cohort range
      const COHORT_RANGES: Record<BetaCohort, { min: number; max: number }> = {
        founding: { min: 12000, max: 24000 },
        early_beta: { min: 6000, max: 12000 },
        post_beta: { min: 2000, max: 4000 },
      };
      const range = COHORT_RANGES[cohort];
      if (amount_cents < range.min || amount_cents > range.max) {
        res.status(400).json({ error: `Amount must be between $${range.min / 100} and $${range.max / 100} for ${cohort} cohort` });
        return;
      }

      // Verify target is a sitter
      const [sitter] = await sql`
        SELECT id, email, name, roles, beta_cohort, founding_sitter
        FROM users WHERE id = ${sitterId} AND roles @> '{sitter}'::text[]
      `;
      if (!sitter) {
        res.status(404).json({ error: 'Sitter not found' });
        return;
      }

      if (sitter.beta_cohort) {
        res.status(409).json({ error: `Sitter already assigned to ${sitter.beta_cohort} cohort` });
        return;
      }

      // Atomic: set cohort + issue credits in single transaction
      const isFounding = cohort === 'founding';
      const creditType = cohort === 'founding' ? 'beta_reward' : 'promo';
      const description = `${cohort === 'founding' ? 'Founding Sitter' : cohort === 'early_beta' ? 'Early Beta' : 'New Sitter'} promotional credits`;

      let entry;
      await sql.begin(async (tx: any) => {
        await tx`
          UPDATE users
          SET beta_cohort = ${cohort},
              founding_sitter = ${isFounding || sitter.founding_sitter}
          WHERE id = ${sitterId}
        `;
        entry = await issueCredit(sitterId, amount_cents, creditType, 'beta_program', description, null, null, tx);
      });

      // Send welcome email
      const emailContent = buildFoundingSitterWelcomeEmail({
        sitterName: sitter.name,
        creditAmountCents: amount_cents,
        cohort,
      });
      sendEmail({ to: sitter.email, ...emailContent }).catch(() => {});

      // In-app notification
      await createNotification(
        sitterId,
        'account_update',
        isFounding ? 'Welcome, Founding Sitter!' : 'Credits Added',
        `You've received $${(amount_cents / 100).toFixed(2)} in platform credits${isFounding ? ' and the Founding Sitter badge' : ''}.`
      );

      res.status(201).json({ entry, cohort, founding_sitter: isFounding });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to issue beta credits');
      res.status(500).json({ error: 'Failed to issue beta credits' });
    }
  });

  // Admin: beta program dashboard
  router.get('/admin/beta/dashboard', adminMiddleware, async (_req: AuthenticatedRequest, res) => {
    try {
      const [stats] = await sql`
        SELECT
          (SELECT count(*)::int FROM pro_periods WHERE source = 'beta' AND status = 'active') as active_beta_sitters,
          (SELECT count(*)::int FROM pro_periods WHERE source = 'beta') as total_beta_sitters,
          (SELECT count(*)::int FROM bookings b
           JOIN pro_periods pp ON pp.user_id = b.sitter_id AND pp.source = 'beta'
           WHERE b.status IN ('completed', 'confirmed', 'in_progress')) as beta_bookings,
          (SELECT count(*)::int FROM reviews r
           JOIN pro_periods pp ON pp.user_id = r.reviewee_id AND pp.source = 'beta') as beta_reviews
      `;

      const betaActive = await isBetaActive();
      const betaEndDate = await getBetaEndDate();

      res.json({
        ...stats,
        beta_active: betaActive,
        beta_end_date: betaEndDate?.toISOString() ?? null,
      });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch beta dashboard');
      res.status(500).json({ error: 'Failed to fetch beta dashboard' });
    }
  });

  // Admin: list beta sitters
  router.get('/admin/beta/sitters', adminMiddleware, async (_req: AuthenticatedRequest, res) => {
    try {
      const sitters = await sql`
        SELECT u.id, u.name, u.email, u.avatar_url, u.beta_cohort, u.founding_sitter,
               pp.id as period_id, pp.source, pp.starts_at, pp.ends_at, pp.status as period_status,
               (SELECT count(*)::int FROM bookings WHERE sitter_id = u.id AND status IN ('completed', 'confirmed', 'in_progress')) as booking_count,
               (SELECT count(*)::int FROM reviews WHERE reviewee_id = u.id) as review_count,
               (SELECT COALESCE(avg(rating), 0)::real FROM reviews WHERE reviewee_id = u.id) as avg_rating
        FROM users u
        JOIN pro_periods pp ON pp.user_id = u.id AND pp.source IN ('beta', 'beta_transition')
        ORDER BY pp.created_at DESC
      `;
      res.json({ sitters });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch beta sitters');
      res.status(500).json({ error: 'Failed to fetch beta sitters' });
    }
  });

  // Admin: update beta settings
  router.put('/admin/beta/settings', adminMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const { beta_active, beta_end_date } = req.body;
      if (typeof beta_active === 'boolean') {
        await setSetting('beta_active', { active: beta_active }, req.userId!);
      }
      if (beta_end_date && typeof beta_end_date === 'string') {
        const parsed = new Date(beta_end_date);
        if (isNaN(parsed.getTime())) {
          res.status(400).json({ error: 'Invalid date format' });
          return;
        }
        await setSetting('beta_end_date', { date: parsed.toISOString() }, req.userId!);
      }

      const betaActive = await isBetaActive();
      const endDate = await getBetaEndDate();
      res.json({ beta_active: betaActive, beta_end_date: endDate?.toISOString() ?? null });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to update beta settings');
      res.status(500).json({ error: 'Failed to update beta settings' });
    }
  });

  // Admin: extend a beta sitter's period
  router.post('/admin/beta/extend/:userId', adminMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const targetUserId = Number(req.params.userId);
      if (!targetUserId || isNaN(targetUserId)) {
        res.status(400).json({ error: 'Invalid user ID' });
        return;
      }

      const { new_end_date } = req.body;
      if (!new_end_date) {
        res.status(400).json({ error: 'new_end_date is required' });
        return;
      }
      const parsed = new Date(new_end_date);
      if (isNaN(parsed.getTime()) || parsed <= new Date()) {
        res.status(400).json({ error: 'new_end_date must be a valid future date' });
        return;
      }

      const [updated] = await sql`
        UPDATE pro_periods SET ends_at = ${parsed.toISOString()}
        WHERE user_id = ${targetUserId} AND status = 'active' AND source IN ('beta', 'beta_transition')
        RETURNING *
      `;
      if (!updated) {
        res.status(404).json({ error: 'No active beta period found for this user' });
        return;
      }
      res.json({ period: updated });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to extend beta period');
      res.status(500).json({ error: 'Failed to extend beta period' });
    }
  });

  // Admin: revoke a beta sitter's period
  router.post('/admin/beta/revoke/:userId', adminMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const targetUserId = Number(req.params.userId);
      if (!targetUserId || isNaN(targetUserId)) {
        res.status(400).json({ error: 'Invalid user ID' });
        return;
      }

      const activePeriod = await getActiveProPeriod(targetUserId);
      if (!activePeriod || !['beta', 'beta_transition'].includes(activePeriod.source)) {
        res.status(404).json({ error: 'No active beta period found for this user' });
        return;
      }

      await cancelProPeriod(activePeriod.id);
      res.json({ success: true, message: 'Beta period revoked' });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to revoke beta period');
      res.status(500).json({ error: 'Failed to revoke beta period' });
    }
  });

  // Admin: clear login lockout for an email
  router.post('/admin/unlock-account', adminMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const { email } = req.body;
      if (!email || typeof email !== 'string') {
        res.status(400).json({ error: 'Email is required' });
        return;
      }
      await clearLockout(email, req.userId);
      res.json({ success: true, message: `Login lockout cleared for ${email}` });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to unlock account');
      res.status(500).json({ error: 'Failed to unlock account' });
    }
  });
}
