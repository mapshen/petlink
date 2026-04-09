import type React from 'react';
import { LayoutDashboard, TrendingUp, Receipt, FileText, Banknote, CreditCard, History, Coins, Crown } from 'lucide-react';

export interface WalletSectionDef {
  readonly id: string;
  readonly label: string;
  readonly icon: React.ElementType;
  readonly description: string;
  readonly group: 'business' | 'billing';
  readonly mode: 'sitter' | 'both';
}

export const ALL_WALLET_SECTIONS: readonly WalletSectionDef[] = [
  // Business group (sitter only)
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, description: 'Financial dashboard', group: 'business', mode: 'sitter' },
  { id: 'earnings', label: 'Earnings', icon: TrendingUp, description: 'Your sitter income', group: 'business', mode: 'sitter' },
  { id: 'expenses', label: 'Expenses', icon: Receipt, description: 'Track business expenses', group: 'business', mode: 'sitter' },
  { id: 'tax', label: 'Tax', icon: FileText, description: 'Tax summary and estimates', group: 'business', mode: 'sitter' },
  { id: 'payouts', label: 'Payouts', icon: Banknote, description: 'Payout history and setup', group: 'business', mode: 'sitter' },
  // Billing group (everyone)
  { id: 'payments', label: 'Payments', icon: CreditCard, description: 'Manage your saved cards', group: 'billing', mode: 'both' },
  { id: 'payment-history', label: 'Payment History', icon: History, description: 'Your payment transactions', group: 'billing', mode: 'both' },
  { id: 'credits', label: 'Credits', icon: Coins, description: 'Credit balance and history', group: 'billing', mode: 'both' },
  { id: 'subscription', label: 'Subscription', icon: Crown, description: 'Manage your plan', group: 'billing', mode: 'sitter' },
];
