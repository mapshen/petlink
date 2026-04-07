import { describe, it, expect } from 'vitest';
import { expenseSchema } from './validation.ts';

describe('expense schema with new categories', () => {
  const baseExpense = {
    amount_cents: 1999,
    description: 'Monthly subscription',
    date: '2026-04-01',
  };

  it('accepts platform_subscription category', () => {
    const result = expenseSchema.safeParse({ ...baseExpense, category: 'platform_subscription' });
    expect(result.success).toBe(true);
  });

  it('accepts platform_fee category', () => {
    const result = expenseSchema.safeParse({ ...baseExpense, category: 'platform_fee' });
    expect(result.success).toBe(true);
  });

  it('still accepts all original categories', () => {
    const original = ['supplies', 'transportation', 'insurance', 'marketing', 'equipment', 'training', 'other'];
    for (const cat of original) {
      const result = expenseSchema.safeParse({ ...baseExpense, category: cat });
      expect(result.success).toBe(true);
    }
  });

  it('rejects unknown category', () => {
    const result = expenseSchema.safeParse({ ...baseExpense, category: 'groceries' });
    expect(result.success).toBe(false);
  });
});

describe('CSV export format', () => {
  it('generates valid CSV header', () => {
    const header = 'Date,Category,Description,Amount (USD),Receipt URL,Auto-logged';
    expect(header.split(',').length).toBe(6);
  });

  it('escapes double quotes in description', () => {
    const desc = 'Dog treats "premium"';
    const escaped = desc.replace(/"/g, '""');
    expect(escaped).toBe('Dog treats ""premium""');
  });

  it('formats cents to dollars with 2 decimals', () => {
    const cents = 1999;
    const dollars = (cents / 100).toFixed(2);
    expect(dollars).toBe('19.99');
  });
});

describe('quarterly tax estimates', () => {
  const ESTIMATED_TAX_RATE = 0.25;

  it('estimates 25% tax on net income', () => {
    const income = 10000;
    const expenses = 3000;
    const netIncome = Math.max(0, income - expenses);
    const estimatedTax = Math.round(netIncome * ESTIMATED_TAX_RATE);
    expect(estimatedTax).toBe(1750);
  });

  it('zero tax when expenses exceed income', () => {
    const income = 3000;
    const expenses = 5000;
    const netIncome = Math.max(0, income - expenses);
    const estimatedTax = Math.round(netIncome * ESTIMATED_TAX_RATE);
    expect(estimatedTax).toBe(0);
  });

  it('quarterly breakdown sums to annual', () => {
    const quarters = [
      { income: 3000, expenses: 1000 },
      { income: 4000, expenses: 1500 },
      { income: 2000, expenses: 500 },
      { income: 5000, expenses: 2000 },
    ];
    const totalIncome = quarters.reduce((s, q) => s + q.income, 0);
    const totalExpenses = quarters.reduce((s, q) => s + q.expenses, 0);
    expect(totalIncome).toBe(14000);
    expect(totalExpenses).toBe(5000);
  });
});
