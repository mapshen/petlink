import type { Router } from 'express';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { validate, cancellationPolicySchema, expenseSchema, featuredListingSchema } from '../validation.ts';
import logger, { sanitizeError } from '../logger.ts';

export default function miscRoutes(router: Router): void {
  // --- Cancellation Policy ---
  router.get('/cancellation-policy', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT cancellation_policy FROM users WHERE id = ${req.userId}`;
      res.json({ cancellation_policy: user?.cancellation_policy || 'flexible' });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to load cancellation policy');
      res.status(500).json({ error: 'Failed to load cancellation policy' });
    }
  });

  router.put('/cancellation-policy', authMiddleware, validate(cancellationPolicySchema), async (req: AuthenticatedRequest, res) => {
    try {
      const [currentUser] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
      if (!currentUser.roles.includes('sitter')) {
        res.status(403).json({ error: 'Only sitters can set cancellation policy' });
        return;
      }
      const { cancellation_policy } = req.body;
      await sql`UPDATE users SET cancellation_policy = ${cancellation_policy} WHERE id = ${req.userId}`;
      res.json({ cancellation_policy });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to update cancellation policy');
      res.status(500).json({ error: 'Failed to update cancellation policy' });
    }
  });

  // --- Expenses ---
  router.get('/expenses', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [currentUser] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
      if (!currentUser.roles.includes('sitter')) {
        res.status(403).json({ error: 'Only sitters can access expenses' });
        return;
      }
      const year = req.query.year ? Number(req.query.year) : null;
      const month = req.query.month ? Number(req.query.month) : null;

      let expenses;
      if (year && month) {
        expenses = await sql`
          SELECT * FROM sitter_expenses
          WHERE sitter_id = ${req.userId}
            AND EXTRACT(YEAR FROM date) = ${year}
            AND EXTRACT(MONTH FROM date) = ${month}
          ORDER BY date DESC
        `;
      } else if (year) {
        expenses = await sql`
          SELECT * FROM sitter_expenses
          WHERE sitter_id = ${req.userId}
            AND EXTRACT(YEAR FROM date) = ${year}
          ORDER BY date DESC
        `;
      } else {
        expenses = await sql`
          SELECT * FROM sitter_expenses
          WHERE sitter_id = ${req.userId}
          ORDER BY date DESC
        `;
      }

      const total = expenses.reduce((sum: number, e: { amount_cents: number }) => sum + e.amount_cents, 0);
      res.json({ expenses, total });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to load expenses');
      res.status(500).json({ error: 'Failed to load expenses' });
    }
  });

  router.get('/expenses/tax-summary', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [currentUser] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
      if (!currentUser.roles.includes('sitter')) {
        res.status(403).json({ error: 'Only sitters can access tax summary' });
        return;
      }
      const rawYear = Number(req.query.year);
      const year = Number.isInteger(rawYear) && rawYear >= 2000 && rawYear <= 2100
        ? rawYear
        : new Date().getFullYear();

      const expenseRows = await sql`
        SELECT category, SUM(amount_cents)::int AS total
        FROM sitter_expenses
        WHERE sitter_id = ${req.userId}
          AND EXTRACT(YEAR FROM date) = ${year}
        GROUP BY category
      `;

      const total_expenses = expenseRows.reduce((sum: number, r: { total: number }) => sum + r.total, 0);
      const expense_by_category: Record<string, number> = {};
      for (const row of expenseRows) {
        expense_by_category[row.category] = row.total;
      }

      // Quarterly estimates (25% estimated tax rate)
      const quarterlyRows = await sql`
        SELECT
          EXTRACT(QUARTER FROM b.start_time)::int as quarter,
          COALESCE(SUM(b.total_price_cents), 0)::int as income
        FROM bookings b
        WHERE b.sitter_id = ${req.userId} AND b.status = 'completed'
          AND EXTRACT(YEAR FROM b.start_time) = ${year}
        GROUP BY quarter
        ORDER BY quarter
      `;
      const quarterlyExpenseRows = await sql`
        SELECT
          EXTRACT(QUARTER FROM date)::int as quarter,
          COALESCE(SUM(amount_cents), 0)::int as expenses
        FROM sitter_expenses
        WHERE sitter_id = ${req.userId} AND EXTRACT(YEAR FROM date) = ${year}
        GROUP BY quarter
        ORDER BY quarter
      `;

      const ESTIMATED_TAX_RATE = 0.25;
      const quarterlyEstimates = [1, 2, 3, 4].map(q => {
        const income = quarterlyRows.find((r: { quarter: number }) => r.quarter === q)?.income || 0;
        const expenses = quarterlyExpenseRows.find((r: { quarter: number }) => r.quarter === q)?.expenses || 0;
        const netIncome = Math.max(0, income - expenses);
        return {
          quarter: `Q${q}`,
          income,
          expenses,
          net_income: netIncome,
          estimated_tax: Math.round(netIncome * ESTIMATED_TAX_RATE),
        };
      });

      // Derive annual totals from quarterly data (avoids redundant query)
      const total_income = quarterlyRows.reduce((sum: number, r: { income: number }) => sum + r.income, 0);
      const netIncome = total_income - total_expenses;
      const annual_estimated_tax = quarterlyEstimates.reduce((sum, q) => sum + q.estimated_tax, 0);

      res.json({
        year,
        total_income,
        total_expenses,
        net_income: netIncome,
        expense_by_category,
        quarterly_estimates: quarterlyEstimates,
        annual_estimated_tax,
      });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to load tax summary');
      res.status(500).json({ error: 'Failed to load tax summary' });
    }
  });

  // CSV export for expenses — all fields quoted to prevent formula injection
  router.get('/expenses/export', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [currentUser] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
      if (!currentUser.roles.includes('sitter')) {
        res.status(403).json({ error: 'Only sitters can export expenses' });
        return;
      }
      const rawYear = Number(req.query.year);
      const year = Number.isInteger(rawYear) && rawYear >= 2000 && rawYear <= 2100
        ? rawYear
        : new Date().getFullYear();

      const expenses = await sql`
        SELECT category, amount_cents, description, date, receipt_url, auto_logged
        FROM sitter_expenses
        WHERE sitter_id = ${req.userId} AND EXTRACT(YEAR FROM date) = ${year}
        ORDER BY date ASC
      `;

      const csvEscape = (val: string): string => `"${val.replace(/"/g, '""')}"`;
      const csvHeader = '"Date","Category","Description","Amount (USD)","Receipt URL","Auto-logged"';
      const csvRows = expenses.map((e: { date: string; category: string; description: string | null; amount_cents: number; receipt_url: string | null; auto_logged: boolean }) =>
        [
          csvEscape(String(e.date)),
          csvEscape(e.category),
          csvEscape(e.description || ''),
          csvEscape((e.amount_cents / 100).toFixed(2)),
          csvEscape(e.receipt_url || ''),
          csvEscape(e.auto_logged ? 'Yes' : 'No'),
        ].join(',')
      );
      const csv = '\uFEFF' + [csvHeader, ...csvRows].join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="expenses-${year}.csv"`);
      res.send(csv);
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to export expenses');
      res.status(500).json({ error: 'Failed to export expenses' });
    }
  });

  router.post('/expenses', authMiddleware, validate(expenseSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const [currentUser] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
      if (!currentUser.roles.includes('sitter')) {
        res.status(403).json({ error: 'Only sitters can create expenses' });
        return;
      }
      const { category, amount_cents, description, date, receipt_url } = req.body;
      const [expense] = await sql`
        INSERT INTO sitter_expenses (sitter_id, category, amount_cents, description, date, receipt_url)
        VALUES (${req.userId}, ${category}, ${amount_cents}, ${description ?? null}, ${date}, ${receipt_url ?? null})
        RETURNING *
      `;
      res.status(201).json({ expense });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to create expense');
      res.status(500).json({ error: 'Failed to create expense' });
    }
  });

  router.put('/expenses/:id', authMiddleware, validate(expenseSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const [existing] = await sql`SELECT id FROM sitter_expenses WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
      if (!existing) {
        res.status(404).json({ error: 'Expense not found' });
        return;
      }
      const { category, amount_cents, description, date, receipt_url } = req.body;
      const [expense] = await sql`
        UPDATE sitter_expenses SET
          category = ${category},
          amount_cents = ${amount_cents},
          description = ${description ?? null},
          date = ${date},
          receipt_url = ${receipt_url ?? null}
        WHERE id = ${req.params.id} AND sitter_id = ${req.userId}
        RETURNING *
      `;
      res.json({ expense });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to update expense');
      res.status(500).json({ error: 'Failed to update expense' });
    }
  });

  router.delete('/expenses/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [existing] = await sql`SELECT id FROM sitter_expenses WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
      if (!existing) {
        res.status(404).json({ error: 'Expense not found' });
        return;
      }
      await sql`DELETE FROM sitter_expenses WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to delete expense');
      res.status(500).json({ error: 'Failed to delete expense' });
    }
  });

  // --- Featured Listings (per-booking commission model) ---
  router.get('/featured-listings/me', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const listings = await sql`SELECT * FROM featured_listings WHERE sitter_id = ${req.userId} ORDER BY created_at DESC`;
      res.json({ listings });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to load featured listings');
      res.status(500).json({ error: 'Failed to load featured listings' });
    }
  });

  router.post('/featured-listings', authMiddleware, validate(featuredListingSchema), async (req: AuthenticatedRequest, res) => {
    try {
      const [user] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
      if (!user.roles.includes('sitter')) {
        res.status(403).json({ error: 'Only sitters can create featured listings' });
        return;
      }
      const { service_type } = req.body;

      if (service_type) {
        const [existing] = await sql`SELECT id FROM featured_listings WHERE sitter_id = ${req.userId} AND service_type = ${service_type}`;
        if (existing) {
          res.status(409).json({ error: 'You already have a featured listing for this service type' });
          return;
        }
      }

      const [listing] = await sql`
        INSERT INTO featured_listings (sitter_id, service_type)
        VALUES (${req.userId}, ${service_type || null})
        RETURNING *
      `;
      res.status(201).json({ listing });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to create featured listing');
      res.status(500).json({ error: 'Failed to create featured listing' });
    }
  });

  router.put('/featured-listings/:id/pause', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [listing] = await sql`SELECT id FROM featured_listings WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
      if (!listing) { res.status(404).json({ error: 'Listing not found' }); return; }
      const [updated] = await sql`UPDATE featured_listings SET active = FALSE WHERE id = ${req.params.id} AND sitter_id = ${req.userId} RETURNING *`;
      res.json({ listing: updated });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to pause featured listing');
      res.status(500).json({ error: 'Failed to pause listing' });
    }
  });

  router.put('/featured-listings/:id/resume', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [listing] = await sql`SELECT id FROM featured_listings WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
      if (!listing) { res.status(404).json({ error: 'Listing not found' }); return; }
      const [updated] = await sql`UPDATE featured_listings SET active = TRUE WHERE id = ${req.params.id} AND sitter_id = ${req.userId} RETURNING *`;
      res.json({ listing: updated });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to resume featured listing');
      res.status(500).json({ error: 'Failed to resume listing' });
    }
  });

  router.delete('/featured-listings/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const [listing] = await sql`SELECT id FROM featured_listings WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
      if (!listing) { res.status(404).json({ error: 'Listing not found' }); return; }
      await sql`DELETE FROM featured_listings WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
      res.json({ success: true });
    } catch (error) {
      logger.error({ err: sanitizeError(error) }, 'Failed to delete featured listing');
      res.status(500).json({ error: 'Failed to delete listing' });
    }
  });
}
