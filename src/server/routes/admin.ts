import type { Router } from 'express';
import sql from '../db.ts';
import { type AuthenticatedRequest } from '../auth.ts';
import { validate, approvalDecisionSchema } from '../validation.ts';
import { adminMiddleware } from '../admin.ts';
import { sendEmail, buildApprovalStatusEmail } from '../email.ts';
import { createNotification } from '../notifications.ts';
import { clearLockout } from '../login-lockout.ts';

export default function adminRoutes(router: Router): void {
  router.get('/admin/pending-sitters', adminMiddleware, async (req: AuthenticatedRequest, res) => {
    const sitters = await sql`
      SELECT id, email, name, roles, bio, avatar_url, created_at, approval_status,
             years_experience, home_type, has_yard, has_fenced_yard, has_own_pets, own_pets_description,
             accepted_species, skills
      FROM users
      WHERE approval_status = 'pending_approval' AND roles @> '{sitter}'::text[]
      ORDER BY created_at ASC
    `;
    res.json({ sitters });
  });

  router.get('/admin/sitters', adminMiddleware, async (req: AuthenticatedRequest, res) => {
    const status = req.query.status as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const validStatuses = ['approved', 'pending_approval', 'rejected', 'banned'];
    const statusFilter = status && validStatuses.includes(status) ? status : undefined;

    const sitters = await sql`
      SELECT id, email, name, roles, bio, avatar_url, created_at, approval_status, approved_at, approval_rejected_reason,
             years_experience, home_type, has_yard, has_fenced_yard, has_own_pets, own_pets_description,
             accepted_species, skills
      FROM users
      WHERE roles @> '{sitter}'::text[]
      ${statusFilter ? sql`AND approval_status = ${statusFilter}` : sql``}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    const [{ total }] = await sql`
      SELECT count(*)::int as total FROM users
      WHERE roles @> '{sitter}'::text[]
      ${statusFilter ? sql`AND approval_status = ${statusFilter}` : sql``}
    `;
    res.json({ sitters, total });
  });

  router.put('/admin/sitters/:id/approval', adminMiddleware, validate(approvalDecisionSchema), async (req: AuthenticatedRequest, res) => {
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
  });

  // Admin: clear login lockout for an email
  router.post('/admin/unlock-account', adminMiddleware, async (req: AuthenticatedRequest, res) => {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'Email is required' });
      return;
    }
    await clearLockout(email, req.userId);
    res.json({ success: true, message: `Login lockout cleared for ${email}` });
  });
}
