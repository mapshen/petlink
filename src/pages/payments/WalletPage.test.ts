import { describe, it, expect } from 'vitest';
import { buildExpensePayload, isReceiptImage } from './WalletPage';
import { buildRecurringExpensePayload } from '../../components/payment/RecurringExpenses';

describe('buildExpensePayload', () => {
  it('includes receipt_url when provided', () => {
    const payload = buildExpensePayload({
      category: 'supplies',
      amount: '25.50',
      description: 'Dog treats',
      date: '2026-01-15',
      receipt_url: 'https://cdn.example.com/receipts/5/abc.jpg',
    });
    expect(payload).toEqual({
      category: 'supplies',
      amount_cents: 2550,
      description: 'Dog treats',
      date: '2026-01-15',
      receipt_url: 'https://cdn.example.com/receipts/5/abc.jpg',
    });
  });

  it('sends null receipt_url when empty', () => {
    const payload = buildExpensePayload({
      category: 'transportation',
      amount: '10.00',
      description: '',
      date: '2026-02-01',
      receipt_url: '',
    });
    expect(payload).toEqual({
      category: 'transportation',
      amount_cents: 1000,
      description: null,
      date: '2026-02-01',
      receipt_url: null,
    });
  });

  it('uses dollarsToCents for proper rounding', () => {
    const payload = buildExpensePayload({
      category: 'equipment',
      amount: '19.99',
      description: '',
      date: '2026-03-01',
      receipt_url: '',
    });
    expect(payload.amount_cents).toBe(1999);
  });

  it('handles amounts with floating point precision issues', () => {
    const payload = buildExpensePayload({
      category: 'supplies',
      amount: '0.10',
      description: '',
      date: '2026-04-01',
      receipt_url: '',
    });
    expect(payload.amount_cents).toBe(10);
  });
});

describe('isReceiptImage', () => {
  it('returns true for JPEG URLs', () => {
    expect(isReceiptImage('https://cdn.example.com/receipt.jpg')).toBe(true);
    expect(isReceiptImage('https://cdn.example.com/receipt.jpeg')).toBe(true);
  });

  it('returns true for PNG URLs', () => {
    expect(isReceiptImage('https://cdn.example.com/receipt.png')).toBe(true);
  });

  it('returns true for WebP URLs', () => {
    expect(isReceiptImage('https://cdn.example.com/receipt.webp')).toBe(true);
  });

  it('returns true for GIF URLs', () => {
    expect(isReceiptImage('https://cdn.example.com/receipt.gif')).toBe(true);
  });

  it('returns false for non-image URLs', () => {
    expect(isReceiptImage('https://cdn.example.com/receipt.pdf')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isReceiptImage('')).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isReceiptImage(undefined)).toBe(false);
  });

  it('handles URLs with query parameters', () => {
    expect(isReceiptImage('https://cdn.example.com/receipt.jpg?v=123')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isReceiptImage('https://cdn.example.com/receipt.JPG')).toBe(true);
    expect(isReceiptImage('https://cdn.example.com/receipt.PNG')).toBe(true);
  });
});

describe('buildRecurringExpensePayload', () => {
  it('converts dollars to cents and includes day_of_month', () => {
    const payload = buildRecurringExpensePayload({
      category: 'insurance',
      amount: '45.00',
      description: 'Pet insurance',
      day_of_month: 1,
    });
    expect(payload).toEqual({
      category: 'insurance',
      amount_cents: 4500,
      description: 'Pet insurance',
      day_of_month: 1,
    });
  });

  it('sends null description when empty', () => {
    const payload = buildRecurringExpensePayload({
      category: 'supplies',
      amount: '25.50',
      description: '',
      day_of_month: 15,
    });
    expect(payload).toEqual({
      category: 'supplies',
      amount_cents: 2550,
      description: null,
      day_of_month: 15,
    });
  });

  it('handles floating point amounts correctly', () => {
    const payload = buildRecurringExpensePayload({
      category: 'equipment',
      amount: '9.99',
      description: 'Software',
      day_of_month: 28,
    });
    expect(payload.amount_cents).toBe(999);
  });
});
