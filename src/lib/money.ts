import { dinero, toDecimal, add, type Dinero, type DineroSnapshot } from 'dinero.js';
import { USD } from 'dinero.js/currencies';

/** Create a Dinero object from integer cents */
export function cents(amount: number): Dinero<number> {
  return dinero({ amount, currency: USD });
}

/** Convert dollars (float) to integer cents — use at input boundaries only */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

/** Format cents as a dollar string: 2550 → "$25.50" */
export function formatCents(amount: number): string {
  return toDecimal(cents(amount), ({ value }) => `$${value}`);
}

/** Format cents as a plain decimal string: 2550 → "25.50" */
export function formatCentsDecimal(amount: number): string {
  return toDecimal(cents(amount), ({ value }) => value);
}

/** Add two cent amounts safely */
export function addCents(a: number, b: number): number {
  return a + b;
}

export { USD, dinero, toDecimal, add, type Dinero, type DineroSnapshot };
