import type React from 'react';
import { LayoutDashboard, TrendingUp, Receipt, FileText, Banknote, History, Coins } from 'lucide-react';

export interface WalletSectionDef {
  readonly id: string;
  readonly label: string;
  readonly icon: React.ElementType;
  readonly description: string;
  readonly mode: 'sitter' | 'both';
}

export const ALL_WALLET_SECTIONS: readonly WalletSectionDef[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, description: 'Financial dashboard', mode: 'sitter' },
  { id: 'earnings', label: 'Earnings', icon: TrendingUp, description: 'Your sitter income', mode: 'sitter' },
  { id: 'expenses', label: 'Expenses', icon: Receipt, description: 'Track business expenses', mode: 'sitter' },
  { id: 'tax', label: 'Tax', icon: FileText, description: 'Tax summary and estimates', mode: 'sitter' },
  { id: 'payouts', label: 'Payouts', icon: Banknote, description: 'Payout history and setup', mode: 'sitter' },
  { id: 'payment-history', label: 'Payment History', icon: History, description: 'Your payment transactions', mode: 'both' },
  { id: 'credits', label: 'Credits', icon: Coins, description: 'Credit balance and history', mode: 'both' },
];
