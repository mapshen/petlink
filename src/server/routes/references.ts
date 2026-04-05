import type { Router } from 'express';
import crypto from 'crypto';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { validate, inviteReferenceSchema, submitVouchSchema } from '../validation.ts';
import { sendEmail, buildReferenceInviteEmail } from '../email.ts';
import logger, { sanitizeError } from '../logger.ts';

export default function referenceRoutes(router: Router): void {
  // POST /references/invite — sitter invites a past client
  router.post('/references/invite', authMiddleware, validate(inviteReferenceSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT roles, name FROM users WHERE id = ${req.userId}`;
      if (!user?.roles?.includes('sitter')) {
        res.status(403).json({ error: 'Sitter role required' });
        return;
      }

      const { client_name, client_email } = req.body;
      const inviteToken = crypto.randomBytes(32).toString('hex');

      let reference;
      try {
        [reference] = await sql`
          INSERT INTO sitter_references (sitter_id, client_name, client_email, invite_token)
          VALUES (${req.userId}, ${client_name}, ${client_email}, ${inviteToken})
          RETURNING *
        `;
      } catch (err: any) {
        if (err?.code === '23505') {
          res.status(409).json({ error: 'You have already invited this email address' });
          return;
        }
        throw err;
      }

      // Send invite email (fire-and-forget)
      const email = buildReferenceInviteEmail({
        clientName: client_name,
        sitterName: user.name,
        vouchUrl: `${process.env.APP_URL || 'https://petlink.app'}/vouch/${inviteToken}`,
      });
      sendEmail({ to: client_email, ...email }).catch((err) => {
        logger.error({ err: sanitizeError(err) }, 'Failed to send reference invite email');
      });

      res.status(201).json({ reference });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to create reference invite');
      res.status(500).json({ error: 'Failed to send invite' });
    }
  });

  // GET /references/me — list sitter's references
  router.get('/references/me', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const references = await sql`
        SELECT id, client_name, client_email, rating, comment, status, created_at, completed_at
        FROM sitter_references
        WHERE sitter_id = ${req.userId}
        ORDER BY created_at DESC
      `;
      res.json({ references });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to list references');
      res.status(500).json({ error: 'Failed to load references' });
    }
  });

  // POST /references/vouch/:token — public endpoint, client submits vouch
  router.post('/references/vouch/:token', validate(submitVouchSchema), async (req, res) => {
    try {
      const { token } = req.params;
      if (!token || token.length !== 64) {
        res.status(400).json({ error: 'Invalid token' });
        return;
      }

      const { rating, comment } = req.body;

      const [updated] = await sql`
        UPDATE sitter_references
        SET status = 'completed', rating = ${rating}, comment = ${comment},
            completed_at = NOW()
        WHERE invite_token = ${token} AND status = 'pending'
        RETURNING *
      `;

      if (!updated) {
        res.status(404).json({ error: 'Invalid or already completed reference' });
        return;
      }

      res.json({ ok: true });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to submit vouch');
      res.status(500).json({ error: 'Failed to submit reference' });
    }
  });

  // GET /references/vouch/:token — public endpoint, get reference details for vouch form
  router.get('/references/vouch/:token', async (req, res) => {
    try {
      const { token } = req.params;
      if (!token || token.length !== 64) {
        res.status(400).json({ error: 'Invalid token' });
        return;
      }

      const [ref] = await sql`
        SELECT sr.client_name, sr.status, u.name as sitter_name
        FROM sitter_references sr
        JOIN users u ON u.id = sr.sitter_id
        WHERE sr.invite_token = ${token}
      `;

      if (!ref) {
        res.status(404).json({ error: 'Reference not found' });
        return;
      }

      res.json({ reference: { client_name: ref.client_name, sitter_name: ref.sitter_name, status: ref.status } });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to get vouch details');
      res.status(500).json({ error: 'Failed to load reference' });
    }
  });
}
