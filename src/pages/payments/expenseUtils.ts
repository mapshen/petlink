import type { ExpenseForm } from './walletTypes';
import { dollarsToCents } from '../../lib/money';

export function buildExpensePayload(form: ExpenseForm) {
  return {
    category: form.category,
    amount_cents: dollarsToCents(Number(form.amount)),
    description: form.description || null,
    date: form.date,
    receipt_url: form.receipt_url || null,
  };
}

export function isReceiptImage(url: string | undefined | null): boolean {
  if (!url) return false;
  const pathname = url.split('?')[0];
  return /\.(jpe?g|png|webp|gif)$/i.test(pathname);
}
