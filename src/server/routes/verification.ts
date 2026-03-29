import type { Router } from 'express';
import type { RateLimitRequestHandler } from 'express-rate-limit';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { validate, verificationUpdateSchema } from '../validation.ts';
import { botBlockMiddleware, requireUserAgent } from '../bot-detection.ts';
import { createCandidate, createInvitation, verifyWebhookSignature, parseWebhookEvent, mapCheckrStatus, isCheckrConfigured } from '../checkr.ts';
import { createNotification } from '../notifications.ts';

export default function verificationRoutes(router: Router, publicLimiter: RateLimitRequestHandler): void {
  router.get('/verification/me', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [verification] = await sql`SELECT * FROM verifications WHERE sitter_id = ${req.userId}`;
    res.json({ verification: verification || null });
  });

  router.post('/verification/start', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [user] = await sql`SELECT role, email, name FROM users WHERE id = ${req.userId}`;
    if (user.role !== 'sitter' && user.role !== 'both') {
      res.status(403).json({ error: 'Only sitters can start verification' });
      return;
    }

    const [existing] = await sql`SELECT id FROM verifications WHERE sitter_id = ${req.userId}`;
    if (existing) {
      res.status(409).json({ error: 'Verification already started' });
      return;
    }

    let checkrCandidateId: string | null = null;
    let checkrInvitationUrl: string | null = null;

    if (isCheckrConfigured()) {
      try {
        const nameParts = (user.name || '').trim().split(/\s+/);
        const firstName = nameParts[0] || 'Unknown';
        const lastName = nameParts.slice(1).join(' ') || 'Unknown';
        const candidate = await createCandidate(user.email, firstName, lastName);
        checkrCandidateId = candidate.id;

        const invitation = await createInvitation(candidate.id);
        checkrInvitationUrl = invitation.invitation_url;
      } catch (err) {
        console.error('Checkr integration error:', err);
        // Fall through — create verification record without Checkr
      }
    }

    const [verification] = await sql`
      INSERT INTO verifications (sitter_id, submitted_at, checkr_candidate_id, checkr_invitation_url, background_check_status)
      VALUES (${req.userId}, NOW(), ${checkrCandidateId}, ${checkrInvitationUrl}, ${checkrCandidateId ? 'submitted' : 'pending'}::bg_check_status)
      RETURNING *
    `;
    res.status(201).json({ verification });
  });

  router.put('/verification/update', authMiddleware, validate(verificationUpdateSchema), async (req: AuthenticatedRequest, res) => {
    const { house_photos_url } = req.body;
    const [verification] = await sql`SELECT * FROM verifications WHERE sitter_id = ${req.userId}`;
    if (!verification) {
      res.status(404).json({ error: 'No verification found. Start verification first.' });
      return;
    }
    const [updated] = await sql`
      UPDATE verifications SET house_photos_url = ${house_photos_url} WHERE sitter_id = ${req.userId}
      RETURNING *
    `;
    res.json({ verification: updated });
  });

  // Webhook endpoint for background check results (supports both Checkr and legacy format)
  router.post('/webhooks/background-check', async (req, res) => {
    // Checkr webhook format detection
    const event = parseWebhookEvent(req.body);
    if (event && event.type && event.data?.object?.candidate_id) {
      // Checkr webhook — verify signature (required)
      const checkrSecret = process.env.CHECKR_WEBHOOK_SECRET;
      if (!checkrSecret) {
        res.status(500).json({ error: 'Webhook secret not configured' });
        return;
      }
      const signature = req.headers['x-checkr-signature'] as string || '';
      const rawBody = JSON.stringify(req.body);
      if (!verifyWebhookSignature(rawBody, signature, checkrSecret)) {
        res.status(401).json({ error: 'Invalid webhook signature' });
        return;
      }

      // Only process report.completed events
      if (event.type !== 'report.completed') {
        res.json({ received: true, ignored: true });
        return;
      }

      const report = event.data.object;
      const [verification] = await sql`SELECT * FROM verifications WHERE checkr_candidate_id = ${report.candidate_id}`;
      if (!verification) {
        res.status(404).json({ error: 'Verification not found for candidate' });
        return;
      }

      const bgStatus = mapCheckrStatus(report.status, report.result, report.adjudication);
      await sql`UPDATE verifications SET background_check_status = ${bgStatus}::bg_check_status, checkr_report_id = ${report.id} WHERE checkr_candidate_id = ${report.candidate_id}`;

      const [updated] = await sql`SELECT * FROM verifications WHERE checkr_candidate_id = ${report.candidate_id}`;
      if (updated.background_check_status === 'passed' && updated.id_check_status === 'approved') {
        await sql`UPDATE verifications SET completed_at = NOW() WHERE id = ${updated.id}`;
        await createNotification(updated.sitter_id, 'verification_update', 'Verification Complete', 'Your background check has been approved!', { verification_id: updated.id });
      }

      res.json({ success: true });
      return;
    }

    // Legacy webhook format (sitter_id + status)
    const webhookSecret = process.env.BG_CHECK_WEBHOOK_SECRET;
    if (!webhookSecret) {
      res.status(500).json({ error: 'Webhook secret not configured' });
      return;
    }
    const legacySignature = req.headers['x-webhook-signature'] as string || '';
    const legacyBody = JSON.stringify(req.body);
    if (!verifyWebhookSignature(legacyBody, legacySignature, webhookSecret)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { sitter_id, status } = req.body;
    if (!sitter_id || !status) {
      res.status(400).json({ error: 'sitter_id and status are required' });
      return;
    }
    const validStatuses = ['submitted', 'passed', 'failed'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }

    const [verification] = await sql`SELECT * FROM verifications WHERE sitter_id = ${sitter_id}`;
    if (!verification) {
      res.status(404).json({ error: 'Verification not found' });
      return;
    }

    await sql`UPDATE verifications SET background_check_status = ${status}::bg_check_status WHERE sitter_id = ${sitter_id}`;

    const [updated] = await sql`SELECT * FROM verifications WHERE sitter_id = ${sitter_id}`;
    if (updated.background_check_status === 'passed' && updated.id_check_status === 'approved') {
      await sql`UPDATE verifications SET completed_at = NOW() WHERE sitter_id = ${sitter_id}`;
      await createNotification(updated.sitter_id, 'verification_update', 'Verification Complete', 'Your background check has been approved!', { verification_id: updated.id });
    }

    res.json({ success: true });
  });

  // Get verification status for a sitter (public)
  router.get('/verification/:sitterId', requireUserAgent, botBlockMiddleware, publicLimiter, async (req, res) => {
    const [verification] = await sql`
      SELECT id_check_status, background_check_status, completed_at FROM verifications WHERE sitter_id = ${req.params.sitterId}
    `;
    res.json({ verification: verification || null });
  });
}
