import type React from 'react';
import { LayoutDashboard, TrendingUp, Receipt, FileText, Banknote, History, Coins } from 'lucide-react';

export interface WalletSectionDef {
  readonly id: string;
  readonly label: string;
  readonly icon: React.ElementType;
  readonly description: string;
  readonly group: 'sitter' | 'account';
  readonly mode: 'sitter' | 'both';
}

export const ALL_WALLET_SECTIONS: readonly WalletSectionDef[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, description: 'Financial dashboard', group: 'sitter', mode: 'sitter' },
  { id: 'earnings', label: 'Earnings', icon: TrendingUp, description: 'Your sitter income', group: 'sitter', mode: 'sitter' },
  { id: 'expenses', label: 'Expenses', icon: Receipt, description: 'Track business expenses', group: 'sitter', mode: 'sitter' },
  { id: 'tax', label: 'Tax', icon: FileText, description: 'Tax summary and estimates', group: 'sitter', mode: 'sitter' },
  { id: 'payouts', label: 'Payouts', icon: Banknote, description: 'Payout history and setup', group: 'sitter', mode: 'sitter' },
  { id: 'payment-history', label: 'Payment History', icon: History, description: 'Your payment transactions', group: 'account', mode: 'both' },
  { id: 'credits', label: 'Credits', icon: Coins, description: 'Credit balance and history', group: 'account', mode: 'both' },
];
