import type { Router } from 'express';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import {
  createConnectAccount,
  createAccountLink,
  syncConnectAccountStatus,
  getConnectInfo,
} from '../stripe-connect.ts';
import logger, { sanitizeError } from '../logger.ts';

export default function connectRoutes(router: Router): void {
  // Create a Stripe Connect Express account for the current sitter
  router.post('/connect/account', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT roles, email, stripe_account_id FROM users WHERE id = ${req.userId}`;
      if (!user?.roles?.includes('sitter')) {
        res.status(403).json({ error: 'Only sitters can create Connect accounts' });
        return;
      }
      if (user.stripe_account_id) {
        res.status(409).json({ error: 'Connect account already exists' });
        return;
      }

      const { stripeAccountId } = await createConnectAccount(req.userId!, user.email);
      res.json({ stripe_account_id: stripeAccountId });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Connect account creation error');
      res.status(500).json({ error: 'Failed to create Connect account' });
    }
  });

  // Generate an Account Link URL for onboarding or updating
  router.post('/connect/onboarding-link', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT roles, stripe_account_id FROM users WHERE id = ${req.userId}`;
      if (!user?.roles?.includes('sitter')) {
        res.status(403).json({ error: 'Only sitters can access Connect onboarding' });
        return;
      }
      if (!user.stripe_account_id) {
        res.status(400).json({ error: 'No Connect account found. Create one first.' });
        return;
      }

      const baseUrl = process.env.APP_URL;
      if (!baseUrl) {
        res.status(500).json({ error: 'Server misconfiguration: APP_URL not set' });
        return;
      }
      const type = req.body.type === 'account_update' ? 'account_update' as const : 'account_onboarding' as const;

      const { url, expiresAt } = await createAccountLink(
        user.stripe_account_id,
        `${baseUrl}/connect/return`,
        `${baseUrl}/connect/refresh`,
        type
      );

      res.json({ url, expires_at: expiresAt });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Connect onboarding link error');
      res.status(500).json({ error: 'Failed to generate onboarding link' });
    }
  });

  // Get current sitter's Connect account status
  router.get('/connect/status', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT roles, stripe_account_id FROM users WHERE id = ${req.userId}`;
      if (!user?.roles?.includes('sitter')) {
        res.status(403).json({ error: 'Only sitters can view Connect status' });
        return;
      }

      if (!user.stripe_account_id) {
        res.json({
          stripe_account_id: null,
          stripe_connect_status: 'not_started',
          stripe_payouts_enabled: false,
          stripe_charges_enabled: false,
        });
        return;
      }

      // Sync live status from Stripe
      const info = await syncConnectAccountStatus(user.stripe_account_id);
      res.json(info);
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Connect status error');
      res.status(500).json({ error: 'Failed to get Connect status' });
    }
  });

  // Generate a fresh onboarding link (for expired/invalid links)
  router.post('/connect/refresh-link', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT roles, stripe_account_id FROM users WHERE id = ${req.userId}`;
      if (!user?.roles?.includes('sitter')) {
        res.status(403).json({ error: 'Only sitters can access Connect' });
        return;
      }
      if (!user.stripe_account_id) {
        res.status(400).json({ error: 'No Connect account found' });
        return;
      }

      const baseUrl = process.env.APP_URL;
      if (!baseUrl) {
        res.status(500).json({ error: 'Server misconfiguration: APP_URL not set' });
        return;
      }
      const { url, expiresAt } = await createAccountLink(
        user.stripe_account_id,
        `${baseUrl}/connect/return`,
        `${baseUrl}/connect/refresh`,
        'account_onboarding'
      );

      res.json({ url, expires_at: expiresAt });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Connect refresh link error');
      res.status(500).json({ error: 'Failed to refresh onboarding link' });
    }
  });
}
