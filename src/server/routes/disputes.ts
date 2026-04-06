import type { Router } from 'express';
import type { Server } from 'socket.io';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { adminMiddleware } from '../admin.ts';
import { validate, createDisputeSchema, disputeMessageSchema, resolveDisputeSchema, updateDisputeStatusSchema } from '../validation.ts';
import { createNotification } from '../notifications.ts';
import { sendEmail, buildDisputeStatusEmail, buildDisputeResolutionEmail } from '../email.ts';
import { refundPayment, cancelPayment } from '../payments.ts';
import logger, { sanitizeError } from '../logger.ts';

const DISPUTE_WINDOW_DAYS = 14;

export default function disputeRoutes(router: Router, io: Server): void {
  // Create a dispute
  router.post('/disputes', authMiddleware, validate(createDisputeSchema), async (req: AuthenticatedRequest, res) => {
    const { booking_id, incident_id, reason } = req.body;

    const [booking] = await sql`
      SELECT b.id, b.owner_id, b.sitter_id, b.status, b.start_time, b.end_time,
             svc.type as service_type
      FROM bookings b
      LEFT JOIN services svc ON b.service_id = svc.id
      WHERE b.id = ${booking_id}
    `;
    if (!booking) {
      res.status(404).json({ error: 'Booking not found' });
      return;
    }
    if (booking.owner_id !== req.userId && booking.sitter_id !== req.userId) {
      res.status(403).json({ error: 'You are not part of this booking' });
      return;
    }
    if (!['confirmed', 'in_progress', 'completed'].includes(booking.status)) {
      res.status(400).json({ error: 'Disputes can only be filed on active or completed bookings' });
      return;
    }

    // 14-day window for completed bookings
    if (booking.status === 'completed') {
      const completedAt = new Date(booking.end_time);
      const windowEnd = new Date(completedAt.getTime() + DISPUTE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      if (new Date() > windowEnd) {
        res.status(400).json({ error: `Disputes must be filed within ${DISPUTE_WINDOW_DAYS} days of booking completion` });
        return;
      }
    }

    // Validate incident link if provided
    if (incident_id) {
      const [incident] = await sql`SELECT id FROM incident_reports WHERE id = ${incident_id} AND booking_id = ${booking_id}`;
      if (!incident) {
        res.status(400).json({ error: 'Incident not found on this booking' });
        return;
      }
    }

    // Check no active dispute exists (DB unique index also enforces this)
    const [existing] = await sql`
      SELECT id FROM disputes WHERE booking_id = ${booking_id} AND status NOT IN ('resolved', 'closed')
    `;
    if (existing) {
      res.status(409).json({ error: 'An active dispute already exists for this booking' });
      return;
    }

    const [dispute] = await sql`
      INSERT INTO disputes (booking_id, incident_id, filed_by, reason)
      VALUES (${booking_id}, ${incident_id ?? null}, ${req.userId}, ${reason})
      RETURNING *
    `;

    // Notify other party + admins
    const otherPartyId = booking.owner_id === req.userId ? booking.sitter_id : booking.owner_id;
    const [filer] = await sql`SELECT name, email FROM users WHERE id = ${req.userId}`;
    const [otherParty] = await sql`SELECT name, email FROM users WHERE id = ${otherPartyId}`;

    const notif = await createNotification(
      otherPartyId, 'dispute_update', 'Dispute Filed',
      `${filer.name} has filed a dispute on your booking.`,
      { dispute_id: dispute.id, booking_id }
    );
    if (notif) io.to(String(otherPartyId)).emit('notification', notif);

    const admins = await sql`SELECT id, email, name FROM users WHERE roles @> '{admin}'::text[]`;
    for (const admin of admins) {
      const adminNotif = await createNotification(
        admin.id, 'dispute_update', 'New Dispute Filed',
        `${filer.name} filed a dispute on booking #${booking_id}.`,
        { dispute_id: dispute.id, booking_id }
      );
      if (adminNotif) io.to(String(admin.id)).emit('notification', adminNotif);
    }

    // Emails (fire-and-forget)
    if (otherParty?.email) {
      sendEmail({ to: otherParty.email, ...buildDisputeStatusEmail({ recipientName: otherParty.name, status: 'open', bookingId: booking_id, reason }) })
        .catch((err: unknown) => logger.error({ err: sanitizeError(err as Error) }, 'Failed to send dispute email'));
    }

    res.status(201).json({ dispute });
  });

  // List disputes
  router.get('/disputes', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [currentUser] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
    const isAdmin = currentUser?.roles?.includes('admin');
    const validStatuses = ['open', 'under_review', 'awaiting_response', 'resolved', 'closed'];
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    if (status && !validStatuses.includes(status)) {
      res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
      return;
    }
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 50);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    let disputes;
    let total: number;

    if (isAdmin) {
      const [{ count }] = await sql`
        SELECT COUNT(*)::int as count FROM disputes d
        ${status ? sql`WHERE d.status = ${status}` : sql``}
      `;
      total = count;
      disputes = await sql`
        SELECT d.*,
          filer.name as filed_by_name,
          o.name as owner_name, s.name as sitter_name,
          adm.name as assigned_admin_name,
          b.owner_id, b.sitter_id, svc.type as service_type, b.total_price_cents,
          (SELECT COUNT(*)::int FROM incident_reports ir WHERE ir.booking_id = d.booking_id) as incident_count
        FROM disputes d
        JOIN users filer ON d.filed_by = filer.id
        JOIN bookings b ON d.booking_id = b.id
        JOIN users o ON b.owner_id = o.id
        JOIN users s ON b.sitter_id = s.id
        LEFT JOIN users adm ON d.assigned_admin_id = adm.id
        LEFT JOIN services svc ON b.service_id = svc.id
        ${status ? sql`WHERE d.status = ${status}` : sql``}
        ORDER BY d.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    } else {
      const [{ count }] = await sql`
        SELECT COUNT(*)::int as count FROM disputes d
        JOIN bookings b ON d.booking_id = b.id
        WHERE (b.owner_id = ${req.userId} OR b.sitter_id = ${req.userId})
        ${status ? sql`AND d.status = ${status}` : sql``}
      `;
      total = count;
      disputes = await sql`
        SELECT d.*,
          filer.name as filed_by_name,
          o.name as owner_name, s.name as sitter_name,
          adm.name as assigned_admin_name,
          b.owner_id, b.sitter_id, svc.type as service_type, b.total_price_cents,
          (SELECT COUNT(*)::int FROM incident_reports ir WHERE ir.booking_id = d.booking_id) as incident_count
        FROM disputes d
        JOIN users filer ON d.filed_by = filer.id
        JOIN bookings b ON d.booking_id = b.id
        JOIN users o ON b.owner_id = o.id
        JOIN users s ON b.sitter_id = s.id
        LEFT JOIN users adm ON d.assigned_admin_id = adm.id
        LEFT JOIN services svc ON b.service_id = svc.id
        WHERE (b.owner_id = ${req.userId} OR b.sitter_id = ${req.userId})
        ${status ? sql`AND d.status = ${status}` : sql``}
        ORDER BY d.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `;
    }

    res.json({ disputes, total, limit, offset });
  });

  // Get single dispute with messages
  router.get('/disputes/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const disputeId = Number(req.params.id);
    if (!Number.isInteger(disputeId) || disputeId <= 0) {
      res.status(400).json({ error: 'Invalid dispute ID' });
      return;
    }

    const [dispute] = await sql`
      SELECT d.*,
        filer.name as filed_by_name,
        o.name as owner_name, s.name as sitter_name,
        adm.name as assigned_admin_name,
        b.owner_id, b.sitter_id, svc.type as service_type, b.total_price_cents
      FROM disputes d
      JOIN users filer ON d.filed_by = filer.id
      JOIN bookings b ON d.booking_id = b.id
      JOIN users o ON b.owner_id = o.id
      JOIN users s ON b.sitter_id = s.id
      LEFT JOIN users adm ON d.assigned_admin_id = adm.id
      LEFT JOIN services svc ON b.service_id = svc.id
      WHERE d.id = ${disputeId}
    `;
    if (!dispute) {
      res.status(404).json({ error: 'Dispute not found' });
      return;
    }

    // Auth: must be booking party or admin
    const [currentUser] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
    const isAdmin = currentUser?.roles?.includes('admin');
    if (dispute.owner_id !== req.userId && dispute.sitter_id !== req.userId && !isAdmin) {
      res.status(403).json({ error: 'You are not part of this dispute' });
      return;
    }

    // Fetch messages (hide admin notes from non-admin)
    const messages = isAdmin
      ? await sql`
          SELECT dm.*, u.name as sender_name, u.avatar_url as sender_avatar
          FROM dispute_messages dm
          JOIN users u ON dm.sender_id = u.id
          WHERE dm.dispute_id = ${disputeId}
          ORDER BY dm.created_at
        `
      : await sql`
          SELECT dm.*, u.name as sender_name, u.avatar_url as sender_avatar
          FROM dispute_messages dm
          JOIN users u ON dm.sender_id = u.id
          WHERE dm.dispute_id = ${disputeId} AND dm.is_admin_note = FALSE
          ORDER BY dm.created_at
        `;

    // Add sender_role to each message
    const enrichedMessages = messages.map((m: any) => ({
      ...m,
      sender_role: m.sender_id === dispute.owner_id ? 'owner' : m.sender_id === dispute.sitter_id ? 'sitter' : 'admin',
    }));

    res.json({ dispute, messages: enrichedMessages });
  });

  // Post a message to a dispute
  router.post('/disputes/:id/messages', authMiddleware, validate(disputeMessageSchema), async (req: AuthenticatedRequest, res) => {
    const disputeId = Number(req.params.id);
    if (!Number.isInteger(disputeId) || disputeId <= 0) {
      res.status(400).json({ error: 'Invalid dispute ID' });
      return;
    }

    const [dispute] = await sql`
      SELECT d.*, b.owner_id, b.sitter_id
      FROM disputes d JOIN bookings b ON d.booking_id = b.id
      WHERE d.id = ${disputeId}
    `;
    if (!dispute) {
      res.status(404).json({ error: 'Dispute not found' });
      return;
    }
    if (['resolved', 'closed'].includes(dispute.status)) {
      res.status(400).json({ error: 'Cannot post to a resolved or closed dispute' });
      return;
    }

    const [currentUser] = await sql`SELECT roles, name FROM users WHERE id = ${req.userId}`;
    const isAdmin = currentUser?.roles?.includes('admin');
    const isParty = dispute.owner_id === req.userId || dispute.sitter_id === req.userId;
    if (!isParty && !isAdmin) {
      res.status(403).json({ error: 'You are not part of this dispute' });
      return;
    }

    const { content, is_admin_note, evidence_urls } = req.body;

    // Only admin can post admin notes
    if (is_admin_note && !isAdmin) {
      res.status(403).json({ error: 'Only mediators can post internal notes' });
      return;
    }

    const [message] = await sql`
      INSERT INTO dispute_messages (dispute_id, sender_id, content, is_admin_note, evidence_urls)
      VALUES (${disputeId}, ${req.userId}, ${content}, ${is_admin_note || false}, ${evidence_urls || []})
      RETURNING *
    `;

    await sql`UPDATE disputes SET updated_at = NOW() WHERE id = ${disputeId}`;

    // Notify other participants (skip for admin notes)
    if (!is_admin_note) {
      const notifyIds = [dispute.owner_id, dispute.sitter_id].filter((id: number) => id !== req.userId);
      for (const userId of notifyIds) {
        const notif = await createNotification(
          userId, 'dispute_update', 'New Dispute Message',
          `${currentUser.name} sent a message in your dispute.`,
          { dispute_id: disputeId, booking_id: dispute.booking_id }
        );
        if (notif) io.to(String(userId)).emit('notification', notif);
      }
    }

    res.status(201).json({ message: { ...message, sender_name: currentUser.name, sender_role: isAdmin ? 'admin' : (dispute.owner_id === req.userId ? 'owner' : 'sitter') } });
  });

  // Admin: update dispute status
  router.put('/disputes/:id/status', adminMiddleware, validate(updateDisputeStatusSchema), async (req: AuthenticatedRequest, res) => {
    const disputeId = Number(req.params.id);
    if (!Number.isInteger(disputeId) || disputeId <= 0) {
      res.status(400).json({ error: 'Invalid dispute ID' });
      return;
    }
    const { status } = req.body;

    const [dispute] = await sql`
      SELECT d.*, b.owner_id, b.sitter_id
      FROM disputes d JOIN bookings b ON d.booking_id = b.id
      WHERE d.id = ${disputeId}
    `;
    if (!dispute) {
      res.status(404).json({ error: 'Dispute not found' });
      return;
    }
    if (['resolved', 'closed'].includes(dispute.status)) {
      res.status(400).json({ error: 'Cannot change status of a resolved or closed dispute' });
      return;
    }

    const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (status === 'under_review' && !dispute.assigned_admin_id) {
      updates.assigned_admin_id = req.userId;
    }

    const [updated] = await sql`
      UPDATE disputes SET
        status = ${status},
        assigned_admin_id = ${updates.assigned_admin_id ?? dispute.assigned_admin_id ?? null},
        updated_at = NOW()
      WHERE id = ${disputeId}
      RETURNING *
    `;

    // Notify both parties
    const [admin] = await sql`SELECT name FROM users WHERE id = ${req.userId}`;
    for (const partyId of [dispute.owner_id, dispute.sitter_id]) {
      const [party] = await sql`SELECT name, email FROM users WHERE id = ${partyId}`;
      const notif = await createNotification(
        partyId, 'dispute_update', 'Dispute Updated',
        `Your dispute is now ${status.replace(/_/g, ' ')}.`,
        { dispute_id: disputeId, booking_id: dispute.booking_id }
      );
      if (notif) io.to(String(partyId)).emit('notification', notif);
      if (party?.email) {
        sendEmail({ to: party.email, ...buildDisputeStatusEmail({ recipientName: party.name, status, bookingId: dispute.booking_id }) })
          .catch((err: unknown) => logger.error({ err: sanitizeError(err as Error) }, 'Failed to send dispute status email'));
      }
    }

    res.json({ dispute: updated });
  });

  // Admin: resolve dispute
  router.put('/disputes/:id/resolve', adminMiddleware, validate(resolveDisputeSchema), async (req: AuthenticatedRequest, res) => {
    const disputeId = Number(req.params.id);
    if (!Number.isInteger(disputeId) || disputeId <= 0) {
      res.status(400).json({ error: 'Invalid dispute ID' });
      return;
    }
    const { resolution_type, resolution_amount_cents, resolution_notes } = req.body;

    const [dispute] = await sql`
      SELECT d.*, b.owner_id, b.sitter_id, b.total_price_cents, b.payment_intent_id, b.payment_status
      FROM disputes d JOIN bookings b ON d.booking_id = b.id
      WHERE d.id = ${disputeId}
    `;
    if (!dispute) {
      res.status(404).json({ error: 'Dispute not found' });
      return;
    }
    if (['resolved', 'closed'].includes(dispute.status)) {
      res.status(400).json({ error: 'Dispute is already resolved or closed' });
      return;
    }

    // Validate refund preconditions
    const isRefund = resolution_type === 'full_refund' || resolution_type === 'partial_refund';
    if (isRefund && dispute.total_price_cents == null) {
      res.status(400).json({ error: 'Cannot issue refund: booking has no price recorded' });
      return;
    }
    if (resolution_type === 'partial_refund') {
      if (!resolution_amount_cents) {
        res.status(400).json({ error: 'Partial refund requires an amount' });
        return;
      }
      if (resolution_amount_cents > dispute.total_price_cents) {
        res.status(400).json({ error: 'Refund amount cannot exceed booking total' });
        return;
      }
      if (dispute.payment_status !== 'captured') {
        res.status(400).json({ error: 'Cannot partially refund: payment not yet captured' });
        return;
      }
    }

    // Execute resolution actions + update dispute in transaction
    let resolved;
    try {
      // Stripe calls first (external, idempotent)
      if (resolution_type === 'full_refund' && dispute.payment_intent_id) {
        if (dispute.payment_status === 'captured') {
          await refundPayment(dispute.payment_intent_id);
        } else if (dispute.payment_status === 'pending') {
          await cancelPayment(dispute.payment_intent_id);
        }
      }
      if (resolution_type === 'partial_refund' && dispute.payment_intent_id && resolution_amount_cents) {
        await refundPayment(dispute.payment_intent_id, resolution_amount_cents);
      }

      // DB updates in transaction
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolved = await sql.begin(async (tx: any) => {
        if (isRefund) {
          await tx`UPDATE bookings SET payment_status = 'refunded' WHERE id = ${dispute.booking_id}`;
          await tx`UPDATE sitter_payouts SET status = 'cancelled' WHERE booking_id = ${dispute.booking_id} AND status = 'pending'`.catch(() => {});
        }
        if (resolution_type === 'ban_sitter') {
          await tx`UPDATE users SET approval_status = 'banned', approval_rejected_reason = ${resolution_notes} WHERE id = ${dispute.sitter_id}`;
        }
        if (resolution_type === 'ban_owner') {
          await tx`UPDATE users SET approval_status = 'banned', approval_rejected_reason = ${resolution_notes} WHERE id = ${dispute.owner_id}`;
        }
        const [r] = await tx`
          UPDATE disputes SET
            status = 'resolved',
            resolution_type = ${resolution_type},
            resolution_amount_cents = ${resolution_amount_cents ?? null},
            resolution_notes = ${resolution_notes},
            resolved_at = NOW(),
            updated_at = NOW()
          WHERE id = ${disputeId}
          RETURNING *
        `;
        return r;
      });
    } catch (err) {
      logger.error({ err: sanitizeError(err as Error), disputeId }, 'Failed to execute dispute resolution action');
      res.status(500).json({ error: 'Failed to process resolution. Please try again.' });
      return;
    }

    // Notify both parties
    const refundAmount = resolution_amount_cents
      ? `$${(resolution_amount_cents / 100).toFixed(2)}`
      : resolution_type === 'full_refund' && dispute.total_price_cents
        ? `$${(dispute.total_price_cents / 100).toFixed(2)}`
        : undefined;

    for (const partyId of [dispute.owner_id, dispute.sitter_id]) {
      const [party] = await sql`SELECT name, email FROM users WHERE id = ${partyId}`;
      const notif = await createNotification(
        partyId, 'dispute_update', 'Dispute Resolved',
        `Your dispute has been resolved.`,
        { dispute_id: disputeId, booking_id: dispute.booking_id, resolution_type }
      );
      if (notif) io.to(String(partyId)).emit('notification', notif);
      if (party?.email) {
        sendEmail({ to: party.email, ...buildDisputeResolutionEmail({
          recipientName: party.name,
          resolutionType: resolution_type,
          resolutionNotes: resolution_notes,
          refundAmount,
          bookingId: dispute.booking_id,
        })}).catch((err: unknown) => logger.error({ err: sanitizeError(err as Error) }, 'Failed to send resolution email'));
      }
    }

    res.json({ dispute: resolved });
  });
}
