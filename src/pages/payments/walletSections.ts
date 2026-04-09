import type React from 'react';
import { LayoutDashboard, TrendingUp, Receipt, FileText, Banknote } from 'lucide-react';

export interface WalletSectionDef {
  readonly id: string;
  readonly label: string;
  readonly icon: React.ElementType;
  readonly description: string;
}

export const ALL_WALLET_SECTIONS: readonly WalletSectionDef[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, description: 'Financial dashboard' },
  { id: 'earnings', label: 'Earnings', icon: TrendingUp, description: 'Your sitter income' },
  { id: 'expenses', label: 'Expenses', icon: Receipt, description: 'Track business expenses' },
  { id: 'tax', label: 'Tax', icon: FileText, description: 'Tax summary and estimates' },
  { id: 'payouts', label: 'Payouts', icon: Banknote, description: 'Payout history and setup' },
];
