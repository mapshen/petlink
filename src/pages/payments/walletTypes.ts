export type WalletTab = 'earnings' | 'expenses' | 'tax' | 'payouts' | 'credits';

export interface Expense {
  id: number;
  category: string;
  amount_cents: number;
  description?: string;
  date: string;
  receipt_url?: string;
  auto_logged?: boolean;
  source_reference?: string;
}

export interface QuarterlyEstimate {
  quarter: string;
  income: number;
  expenses: number;
  net_income: number;
  se_tax: number;
  income_tax: number;
  estimated_tax: number;
  due_date: string;
}

export interface TaxSummary {
  year: number;
  filing_status: string;
  total_income: number;
  total_expenses: number;
  net_income: number;
  expense_by_category: Record<string, number>;
  quarterly_estimates: QuarterlyEstimate[];
  annual_se_tax: number;
  annual_income_tax: number;
  annual_estimated_tax: number;
}

export interface ExpenseForm {
  category: string;
  amount: string;
  description: string;
  date: string;
  receipt_url: string;
}
