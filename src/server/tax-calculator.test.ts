import { describe, it, expect } from 'vitest';
import {
  calculateSETax,
  calculateIncomeTax,
  calculateQuarterlyTax,
  isValidFilingStatus,
  IRS_DUE_DATES,
  type FilingStatus,
} from './tax-calculator.ts';

describe('calculateSETax', () => {
  it('returns 0 for zero or negative net income', () => {
    expect(calculateSETax(0)).toBe(0);
    expect(calculateSETax(-5000)).toBe(0);
  });

  it('calculates 15.3% on 92.35% of net income', () => {
    // $10,000 net -> $9,235 taxable -> $1,412.96 SE tax -> 141296 cents
    const result = calculateSETax(1000000);
    expect(result).toBe(141296);
  });

  it('handles small amounts correctly', () => {
    // $100 net -> $92.35 taxable -> $14.13 SE tax -> 1413 cents
    const result = calculateSETax(10000);
    expect(result).toBe(1413);
  });
});

describe('calculateIncomeTax', () => {
  it('returns 0 for zero or negative income', () => {
    expect(calculateIncomeTax(0, 'single')).toBe(0);
    expect(calculateIncomeTax(-1000, 'single')).toBe(0);
  });

  it('returns 0 when income is below standard deduction', () => {
    // $10,000 net income for single filer — after SE deduction and $14,600 standard deduction, taxable is 0
    expect(calculateIncomeTax(1000000, 'single')).toBe(0);
  });

  it('taxes income above standard deduction at correct bracket', () => {
    // $50,000 net for single:
    // SE tax = $50,000 * 0.9235 * 0.153 = $7,064.78 -> half = $3,532.39
    // Taxable = $50,000 - $3,532.39 - $14,600 = $31,867.61
    // Tax: $11,600 * 10% + $20,267.61 * 12% = $1,160 + $2,432.11 = $3,592.11
    const result = calculateIncomeTax(5000000, 'single');
    expect(result).toBe(359211);
  });

  it('married_joint has higher standard deduction', () => {
    const single = calculateIncomeTax(5000000, 'single');
    const joint = calculateIncomeTax(5000000, 'married_joint');
    expect(joint).toBeLessThan(single);
  });
});

describe('calculateQuarterlyTax', () => {
  it('returns both SE and income tax components', () => {
    const result = calculateQuarterlyTax(5000000, 'single');
    expect(result.se_tax).toBeGreaterThan(0);
    expect(result.income_tax).toBeGreaterThan(0);
    expect(result.total).toBe(result.se_tax + result.income_tax);
  });

  it('returns zeros for zero income', () => {
    const result = calculateQuarterlyTax(0, 'single');
    expect(result).toEqual({ se_tax: 0, income_tax: 0, total: 0 });
  });
});

describe('isValidFilingStatus', () => {
  it('accepts valid statuses', () => {
    expect(isValidFilingStatus('single')).toBe(true);
    expect(isValidFilingStatus('married_joint')).toBe(true);
    expect(isValidFilingStatus('married_separate')).toBe(true);
    expect(isValidFilingStatus('head_of_household')).toBe(true);
  });

  it('rejects invalid statuses', () => {
    expect(isValidFilingStatus('divorced')).toBe(false);
    expect(isValidFilingStatus('')).toBe(false);
  });
});

describe('IRS_DUE_DATES', () => {
  it('has all 4 quarters', () => {
    expect(Object.keys(IRS_DUE_DATES)).toEqual(['Q1', 'Q2', 'Q3', 'Q4']);
  });

  it('Q1 is April 15', () => {
    expect(IRS_DUE_DATES.Q1).toBe('Apr 15');
  });
});

describe('filing status tax comparison', () => {
  const statuses: FilingStatus[] = ['single', 'married_joint', 'married_separate', 'head_of_household'];

  it('SE tax is the same regardless of filing status', () => {
    const results = statuses.map(s => calculateSETax(5000000));
    expect(new Set(results).size).toBe(1);
  });

  it('all filing statuses produce non-negative tax', () => {
    for (const status of statuses) {
      const result = calculateQuarterlyTax(3000000, status);
      expect(result.total).toBeGreaterThanOrEqual(0);
    }
  });
});
