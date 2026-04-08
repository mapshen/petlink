import type { ExpenseForm } from './walletTypes';
import type { PayoutStatus } from '../../types';

export const EXPENSE_CATEGORIES = [
  { value: 'supplies', label: 'Supplies', icon: '🛒' },
  { value: 'transportation', label: 'Transportation', icon: '🚗' },
  { value: 'insurance', label: 'Insurance', icon: '🛡️' },
  { value: 'marketing', label: 'Marketing', icon: '📣' },
  { value: 'equipment', label: 'Equipment', icon: '🔧' },
  { value: 'training', label: 'Training', icon: '📚' },
  { value: 'platform_fee', label: 'Platform Fee', icon: '💰' },
  { value: 'platform_subscription', label: 'Subscription', icon: '⭐' },
  { value: 'background_check', label: 'Background Check', icon: '🔍' },
  { value: 'other', label: 'Other', icon: '📝' },
] as const;

export const FILING_STATUS_OPTIONS = [
  { value: 'single', label: 'Single' },
  { value: 'married_joint', label: 'Married Filing Jointly' },
  { value: 'married_separate', label: 'Married Filing Separately' },
  { value: 'head_of_household', label: 'Head of Household' },
] as const;

export const EMPTY_FORM: ExpenseForm = {
  category: 'supplies',
  amount: '',
  description: '',
  date: new Date().toISOString().split('T')[0],
  receipt_url: '',
};

export const PAYOUT_STATUS_STYLES: Record<PayoutStatus, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Pending' },
  processing: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Processing' },
  completed: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Completed' },
  failed: { bg: 'bg-red-100', text: 'text-red-700', label: 'Failed' },
};

export const PAYOUTS_PAGE_SIZE = 20;
