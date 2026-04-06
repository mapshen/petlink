import type { Router } from 'express';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { analyticsDateRangeSchema } from '../validation.ts';
import { requireSitterRole, validateYear, validateRevenuePeriod, getOverview, getClients, getClientDetail, getRevenue } from '../analytics.ts';
import { getProfileViewsAnalytics } from '../profile-views.ts';
import logger, { sanitizeError } from '../logger.ts';

export default function analyticsRoutes(router: Router): void {
  router.get('/analytics/overview', authMiddleware, requireSitterRole, async (req: AuthenticatedRequest, res) => {
    try {
      const dateRange = analyticsDateRangeSchema.safeParse(req.query);
      if (!dateRange.success) {
        res.status(400).json({ error: dateRange.error.issues[0].message });
        return;
      }
      const { start, end } = dateRange.data;
      if (start && end) {
        const result = await getOverview(req.userId!, { startDate: start, endDate: end });
        res.json(result);
        return;
      }
      if (req.query.all === 'true') {
        const result = await getOverview(req.userId!, { startDate: '2020-01-01', endDate: `${new Date().getFullYear() + 1}-01-01` });
        res.json(result);
        return;
      }
      const yearResult = validateYear(req.query.year);
      if (yearResult.valid === false) {
        res.status(400).json({ error: yearResult.error });
        return;
      }
      const result = await getOverview(req.userId!, { year: yearResult.year });
      res.json(result);
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch analytics overview');
      res.status(500).json({ error: 'Failed to fetch analytics overview' });
    }
  });

  router.get('/analytics/clients', authMiddleware, requireSitterRole, async (req: AuthenticatedRequest, res) => {
    try {
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const dateRange = analyticsDateRangeSchema.safeParse(req.query);
      const { start, end } = dateRange.success ? dateRange.data : { start: undefined, end: undefined };
      const clients = await getClients(req.userId!, limit, offset, start, end);
      res.json({ clients });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch analytics clients');
      res.status(500).json({ error: 'Failed to fetch analytics clients' });
    }
  });

  router.get('/analytics/clients/:clientId', authMiddleware, requireSitterRole, async (req: AuthenticatedRequest, res) => {
    try {
      const clientId = Number(req.params.clientId);
      if (!clientId || isNaN(clientId)) {
        res.status(400).json({ error: 'Invalid client ID' });
        return;
      }
      const result = await getClientDetail(req.userId!, clientId);
      if (!result) {
        res.status(404).json({ error: 'Client not found' });
        return;
      }
      if (result.bookings.length === 0) {
        res.status(404).json({ error: 'No bookings found with this client' });
        return;
      }
      res.json(result);
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch client detail');
      res.status(500).json({ error: 'Failed to fetch client detail' });
    }
  });

  router.get('/analytics/revenue', authMiddleware, requireSitterRole, async (req: AuthenticatedRequest, res) => {
    try {
      const dateRange = analyticsDateRangeSchema.safeParse(req.query);
      const { start, end } = dateRange.success ? dateRange.data : { start: undefined, end: undefined };
      const period = validateRevenuePeriod(req.query.period);
      if (start && end) {
        const result = await getRevenue(req.userId!, period, { startDate: start, endDate: end });
        res.json(result);
        return;
      }
      if (req.query.all === 'true') {
        const result = await getRevenue(req.userId!, period, { startDate: '2020-01-01', endDate: `${new Date().getFullYear() + 1}-01-01` });
        res.json(result);
        return;
      }
      const yearResult = validateYear(req.query.year);
      if (yearResult.valid === false) {
        res.status(400).json({ error: yearResult.error });
        return;
      }
      const result = await getRevenue(req.userId!, period, { year: yearResult.year });
      res.json(result);
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch analytics revenue');
      res.status(500).json({ error: 'Failed to fetch analytics revenue' });
    }
  });

  router.get('/analytics/views', authMiddleware, requireSitterRole, async (req: AuthenticatedRequest, res) => {
    try {
      const dateRange = analyticsDateRangeSchema.safeParse(req.query);
      if (!dateRange.success) {
        res.status(400).json({ error: dateRange.error.issues[0].message });
        return;
      }
      const { start, end } = dateRange.data;
      const [currentUser] = await sql`SELECT subscription_tier FROM users WHERE id = ${req.userId}`;
      const isPro = currentUser?.subscription_tier === 'pro' || currentUser?.subscription_tier === 'premium';

      if (start && end) {
        const result = await getProfileViewsAnalytics(req.userId!, start, end, isPro);
        res.json(result);
        return;
      }
      if (req.query.all === 'true') {
        const result = await getProfileViewsAnalytics(req.userId!, '2020-01-01', `${new Date().getFullYear() + 1}-01-01`, isPro);
        res.json(result);
        return;
      }
      const yearResult = validateYear(req.query.year);
      if (yearResult.valid === false) {
        res.status(400).json({ error: yearResult.error });
        return;
      }
      const rangeStart = `${yearResult.year}-01-01`;
      const rangeEnd = `${yearResult.year + 1}-01-01`;
      const result = await getProfileViewsAnalytics(req.userId!, rangeStart, rangeEnd, isPro);
      res.json(result);
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to fetch profile views analytics');
      res.status(500).json({ error: 'Failed to fetch profile views analytics' });
    }
  });
}
