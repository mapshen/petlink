/**
 * Tax estimation utilities for sitter income.
 * DISCLAIMER: These are rough estimates for informational purposes only.
 * Users should consult a tax professional.
 */

export type FilingStatus = 'single' | 'married_joint' | 'married_separate' | 'head_of_household';

// 2026 IRS estimated tax due dates (approximations — actual dates shift if weekends/holidays)
export const IRS_DUE_DATES: Record<string, string> = {
  Q1: 'Apr 15',
  Q2: 'Jun 15',
  Q3: 'Sep 15',
  Q4: 'Jan 15 (next year)',
};

// Self-employment tax rate: 15.3% on 92.35% of net earnings
const SE_TAX_RATE = 0.153;
const SE_TAXABLE_FRACTION = 0.9235;

// Simplified 2025 federal income tax brackets (indexed slightly for 2026 estimate)
const BRACKETS: Record<FilingStatus, { limit: number; rate: number }[]> = {
  single: [
    { limit: 11600, rate: 0.10 },
    { limit: 47150, rate: 0.12 },
    { limit: 100525, rate: 0.22 },
    { limit: 191950, rate: 0.24 },
    { limit: 243725, rate: 0.32 },
    { limit: 609350, rate: 0.35 },
    { limit: Infinity, rate: 0.37 },
  ],
  married_joint: [
    { limit: 23200, rate: 0.10 },
    { limit: 94300, rate: 0.12 },
    { limit: 201050, rate: 0.22 },
    { limit: 383900, rate: 0.24 },
    { limit: 487450, rate: 0.32 },
    { limit: 731200, rate: 0.35 },
    { limit: Infinity, rate: 0.37 },
  ],
  married_separate: [
    { limit: 11600, rate: 0.10 },
    { limit: 47150, rate: 0.12 },
    { limit: 100525, rate: 0.22 },
    { limit: 191950, rate: 0.24 },
    { limit: 243725, rate: 0.32 },
    { limit: 365600, rate: 0.35 },
    { limit: Infinity, rate: 0.37 },
  ],
  head_of_household: [
    { limit: 16550, rate: 0.10 },
    { limit: 63100, rate: 0.12 },
    { limit: 100500, rate: 0.22 },
    { limit: 191950, rate: 0.24 },
    { limit: 243700, rate: 0.32 },
    { limit: 609350, rate: 0.35 },
    { limit: Infinity, rate: 0.37 },
  ],
};

// Standard deductions (approximate 2026)
const STANDARD_DEDUCTIONS: Record<FilingStatus, number> = {
  single: 14600,
  married_joint: 29200,
  married_separate: 14600,
  head_of_household: 21900,
};

/**
 * Calculate self-employment tax on net income (in cents).
 */
export function calculateSETax(netIncomeCents: number): number {
  if (netIncomeCents <= 0) return 0;
  const netDollars = netIncomeCents / 100;
  const taxableBase = netDollars * SE_TAXABLE_FRACTION;
  return Math.round(taxableBase * SE_TAX_RATE * 100);
}

/**
 * Calculate estimated federal income tax (in cents).
 * Applies standard deduction and half of SE tax deduction.
 */
export function calculateIncomeTax(netIncomeCents: number, filingStatus: FilingStatus): number {
  if (netIncomeCents <= 0) return 0;
  const netDollars = netIncomeCents / 100;

  // Deduct half of SE tax (above-the-line deduction)
  const seTaxDollars = (netDollars * SE_TAXABLE_FRACTION * SE_TAX_RATE);
  const halfSE = seTaxDollars / 2;

  // Apply standard deduction
  const standardDeduction = STANDARD_DEDUCTIONS[filingStatus];
  const taxableIncome = Math.max(0, netDollars - halfSE - standardDeduction);

  // Apply brackets
  const brackets = BRACKETS[filingStatus];
  let tax = 0;
  let remaining = taxableIncome;
  let prevLimit = 0;

  for (const bracket of brackets) {
    const bracketWidth = bracket.limit - prevLimit;
    const taxableInBracket = Math.min(remaining, bracketWidth);
    tax += taxableInBracket * bracket.rate;
    remaining -= taxableInBracket;
    prevLimit = bracket.limit;
    if (remaining <= 0) break;
  }

  return Math.round(tax * 100);
}

/**
 * Calculate total estimated tax for a quarter (in cents).
 */
export function calculateQuarterlyTax(
  quarterNetIncomeCents: number,
  filingStatus: FilingStatus
): { se_tax: number; income_tax: number; total: number } {
  const se_tax = calculateSETax(quarterNetIncomeCents);
  const income_tax = calculateIncomeTax(quarterNetIncomeCents, filingStatus);
  return { se_tax, income_tax, total: se_tax + income_tax };
}

export function isValidFilingStatus(s: string): s is FilingStatus {
  return ['single', 'married_joint', 'married_separate', 'head_of_household'].includes(s);
}
