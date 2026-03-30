import type { Router } from 'express';
import sql from '../db.ts';
import { authMiddleware, type AuthenticatedRequest } from '../auth.ts';
import { validate, cancellationPolicySchema, expenseSchema, featuredListingSchema } from '../validation.ts';

export default function miscRoutes(router: Router): void {
  // --- Cancellation Policy ---
  router.get('/cancellation-policy', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [user] = await sql`SELECT cancellation_policy FROM users WHERE id = ${req.userId}`;
    res.json({ cancellation_policy: user.cancellation_policy || 'flexible' });
  });

  router.put('/cancellation-policy', authMiddleware, validate(cancellationPolicySchema), async (req: AuthenticatedRequest, res) => {
    const [currentUser] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
    if (!currentUser.roles.includes('sitter')) {
      res.status(403).json({ error: 'Only sitters can set cancellation policy' });
      return;
    }
    const { cancellation_policy } = req.body;
    await sql`UPDATE users SET cancellation_policy = ${cancellation_policy} WHERE id = ${req.userId}`;
    res.json({ cancellation_policy });
  });

  // --- Expenses ---
  router.get('/expenses', authMiddleware, async (req: AuthenticatedRequest, res) => {
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

    const total = expenses.reduce((sum: number, e: { amount: number }) => sum + e.amount, 0);
    res.json({ expenses, total });
  });

  router.get('/expenses/tax-summary', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [currentUser] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
    if (!currentUser.roles.includes('sitter')) {
      res.status(403).json({ error: 'Only sitters can access tax summary' });
      return;
    }
    const year = Number(req.query.year) || new Date().getFullYear();

    const [incomeRow] = await sql`
      SELECT COALESCE(SUM(total_price), 0)::float AS total_income
      FROM bookings
      WHERE sitter_id = ${req.userId}
        AND status = 'completed'
        AND EXTRACT(YEAR FROM start_time) = ${year}
    `;

    const expenseRows = await sql`
      SELECT category, SUM(amount)::float AS total
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

    res.json({
      year,
      total_income: incomeRow.total_income,
      total_expenses,
      net_income: incomeRow.total_income - total_expenses,
      expense_by_category,
    });
  });

  router.post('/expenses', authMiddleware, validate(expenseSchema), async (req: AuthenticatedRequest, res) => {
    const [currentUser] = await sql`SELECT roles FROM users WHERE id = ${req.userId}`;
    if (!currentUser.roles.includes('sitter')) {
      res.status(403).json({ error: 'Only sitters can create expenses' });
      return;
    }
    const { category, amount, description, date, receipt_url } = req.body;
    const [expense] = await sql`
      INSERT INTO sitter_expenses (sitter_id, category, amount, description, date, receipt_url)
      VALUES (${req.userId}, ${category}, ${amount}, ${description ?? null}, ${date}, ${receipt_url ?? null})
      RETURNING *
    `;
    res.status(201).json({ expense });
  });

  router.put('/expenses/:id', authMiddleware, validate(expenseSchema), async (req: AuthenticatedRequest, res) => {
    const [existing] = await sql`SELECT id FROM sitter_expenses WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
    if (!existing) {
      res.status(404).json({ error: 'Expense not found' });
      return;
    }
    const { category, amount, description, date, receipt_url } = req.body;
    const [expense] = await sql`
      UPDATE sitter_expenses SET
        category = ${category},
        amount = ${amount},
        description = ${description ?? null},
        date = ${date},
        receipt_url = ${receipt_url ?? null}
      WHERE id = ${req.params.id} AND sitter_id = ${req.userId}
      RETURNING *
    `;
    res.json({ expense });
  });

  router.delete('/expenses/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [existing] = await sql`SELECT id FROM sitter_expenses WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
    if (!existing) {
      res.status(404).json({ error: 'Expense not found' });
      return;
    }
    await sql`DELETE FROM sitter_expenses WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
    res.json({ success: true });
  });

  // --- Featured Listings (per-booking commission model) ---
  router.get('/featured-listings/me', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const listings = await sql`SELECT * FROM featured_listings WHERE sitter_id = ${req.userId} ORDER BY created_at DESC`;
    res.json({ listings });
  });

  router.post('/featured-listings', authMiddleware, validate(featuredListingSchema), async (req: AuthenticatedRequest, res) => {
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
  });

  router.put('/featured-listings/:id/pause', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [listing] = await sql`SELECT id FROM featured_listings WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
    if (!listing) { res.status(404).json({ error: 'Listing not found' }); return; }
    const [updated] = await sql`UPDATE featured_listings SET active = FALSE WHERE id = ${req.params.id} AND sitter_id = ${req.userId} RETURNING *`;
    res.json({ listing: updated });
  });

  router.put('/featured-listings/:id/resume', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [listing] = await sql`SELECT id FROM featured_listings WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
    if (!listing) { res.status(404).json({ error: 'Listing not found' }); return; }
    const [updated] = await sql`UPDATE featured_listings SET active = TRUE WHERE id = ${req.params.id} AND sitter_id = ${req.userId} RETURNING *`;
    res.json({ listing: updated });
  });

  router.delete('/featured-listings/:id', authMiddleware, async (req: AuthenticatedRequest, res) => {
    const [listing] = await sql`SELECT id FROM featured_listings WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
    if (!listing) { res.status(404).json({ error: 'Listing not found' }); return; }
    await sql`DELETE FROM featured_listings WHERE id = ${req.params.id} AND sitter_id = ${req.userId}`;
    res.json({ success: true });
  });
}
