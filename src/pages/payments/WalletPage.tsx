import React, { useState, useEffect } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useAuth, getAuthHeaders } from '../../context/AuthContext';
import { useMode } from '../../context/ModeContext';
import { Plus, Trash2, Pencil, X, Save, DollarSign, TrendingUp, TrendingDown, Receipt, Wallet, Clock, CreditCard, ChevronDown, AlertCircle, Gift, ImageIcon, Download, FileText } from 'lucide-react';
import { API_BASE } from '../../config';
import { Booking, SitterPayout, PayoutStatus, CreditEntry, RecurringExpense } from '../../types';
import RecurringExpensesComponent from '../../components/payment/RecurringExpenses';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Alert, AlertDescription } from '../../components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../components/ui/alert-dialog';
import { formatCents, dollarsToCents } from '../../lib/money';
import { useImageUpload } from '../../hooks/useImageUpload';
import ReceiptUpload from '../../components/payment/ReceiptUpload';
import ReceiptPreviewModal from '../../components/payment/ReceiptPreviewModal';

const EXPENSE_CATEGORIES = [
  { value: 'supplies', label: 'Supplies', icon: '🛒' },
  { value: 'transportation', label: 'Transportation', icon: '🚗' },
  { value: 'insurance', label: 'Insurance', icon: '🛡️' },
  { value: 'marketing', label: 'Marketing', icon: '📣' },
  { value: 'equipment', label: 'Equipment', icon: '🔧' },
  { value: 'training', label: 'Training', icon: '📚' },
  { value: 'other', label: 'Other', icon: '📝' },
] as const;

type WalletTab = 'earnings' | 'expenses' | 'tax' | 'payouts' | 'credits';

interface Expense {
  id: number;
  category: string;
  amount_cents: number;
  description?: string;
  date: string;
  receipt_url?: string;
}

interface QuarterlyEstimate {
  quarter: string;
  income: number;
  expenses: number;
  net_income: number;
  se_tax: number;
  income_tax: number;
  estimated_tax: number;
  due_date: string;
}

interface TaxSummary {
  year: number;
  filing_status: string;
  total_income: number;
  total_expenses: number;
  net_income: number;
  expense_by_category: Record<string, number>;
  quarterly_estimates: QuarterlyEstimate[];
  annual_se_tax: number;
  annual_income_tax: number;
  annual_estimated_tax: number;
}

interface ExpenseForm {
  category: string;
  amount: string;
  description: string;
  date: string;
  receipt_url: string;
}

const FILING_STATUS_OPTIONS = [
  { value: 'single', label: 'Single' },
  { value: 'married_joint', label: 'Married Filing Jointly' },
  { value: 'married_separate', label: 'Married Filing Separately' },
  { value: 'head_of_household', label: 'Head of Household' },
] as const;

const EMPTY_FORM: ExpenseForm = { category: 'supplies', amount: '', description: '', date: new Date().toISOString().split('T')[0], receipt_url: '' };

export async function generateTaxPDF(summary: TaxSummary, categories: readonly { value: string; label: string; icon: string }[]) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF();
  const fmt = (cents: number) => `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  let y = 20;

  doc.setFontSize(18);
  doc.text(`PetLink Tax Summary — ${summary.year}`, 14, y);
  y += 10;
  doc.setFontSize(10);
  doc.setTextColor(120, 120, 120);
  doc.text('For informational purposes only. Consult a tax professional.', 14, y);
  doc.setTextColor(0, 0, 0);
  y += 12;

  // Annual summary
  doc.setFontSize(13);
  doc.text('Annual Summary', 14, y); y += 8;
  doc.setFontSize(10);
  doc.text(`Gross Income: ${fmt(summary.total_income)}`, 14, y); y += 6;
  doc.text(`Total Expenses: ${fmt(summary.total_expenses)}`, 14, y); y += 6;
  doc.text(`Net Income: ${fmt(summary.net_income)}`, 14, y); y += 6;
  doc.text(`Self-Employment Tax: ${fmt(summary.annual_se_tax)}`, 14, y); y += 6;
  doc.text(`Estimated Income Tax: ${fmt(summary.annual_income_tax)}`, 14, y); y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text(`Total Estimated Tax: ${fmt(summary.annual_estimated_tax)}`, 14, y);
  doc.setFont('helvetica', 'normal');
  y += 12;

  // Expenses by category
  if (Object.keys(summary.expense_by_category).length > 0) {
    doc.setFontSize(13);
    doc.text('Expenses by Category', 14, y); y += 8;
    doc.setFontSize(10);
    for (const [cat, amount] of Object.entries(summary.expense_by_category)) {
      const label = categories.find(c => c.value === cat)?.label || cat;
      doc.text(`${label}: ${fmt(amount)}`, 14, y); y += 6;
    }
    y += 6;
  }

  // Quarterly estimates
  doc.setFontSize(13);
  doc.text('Quarterly Estimated Tax Payments', 14, y); y += 8;
  doc.setFontSize(10);
  for (const q of summary.quarterly_estimates) {
    doc.text(`${q.quarter} (due ${q.due_date}): ${fmt(q.estimated_tax)}  (SE: ${fmt(q.se_tax)} + Income: ${fmt(q.income_tax)})`, 14, y);
    y += 6;
  }

  doc.save(`petlink-tax-summary-${summary.year}.pdf`);
}

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


const PAYOUT_STATUS_STYLES: Record<PayoutStatus, { bg: string; text: string; label: string }> = {
  pending: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Pending' },
  processing: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Processing' },
  completed: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Completed' },
  failed: { bg: 'bg-red-100', text: 'text-red-700', label: 'Failed' },
};

const PAYOUTS_PAGE_SIZE = 20;

export default function WalletPage() {
  const { user, token, loading: authLoading } = useAuth();
  const { mode } = useMode();
  const isSitter = mode === 'sitter' || (user?.roles?.includes('sitter') ?? false);

  const [tab, setTab] = useState<WalletTab>('earnings');
  const [year, setYear] = useState(new Date().getFullYear());
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<TaxSummary | null>(null);
  const [filingStatus, setFilingStatus] = useState('single');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Payouts
  const [payouts, setPayouts] = useState<SitterPayout[]>([]);
  const [pendingPayouts, setPendingPayouts] = useState<SitterPayout[]>([]);
  const [payoutsOffset, setPayoutsOffset] = useState(0);
  const [hasMorePayouts, setHasMorePayouts] = useState(true);
  const [payoutsLoading, setPayoutsLoading] = useState(false);

  // Connect status
  const [connectEnabled, setConnectEnabled] = useState<boolean | null>(null);

  // Credits
  const [creditBalance, setCreditBalance] = useState(0);
  const [creditHistory, setCreditHistory] = useState<CreditEntry[]>([]);

  // Expense form
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ExpenseForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteDialogId, setDeleteDialogId] = useState<number | null>(null);

  // Recurring expenses
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([]);

  // Receipt upload
  const { uploading: receiptUploading, upload: uploadReceipt, error: receiptError, clearError: clearReceiptError } = useImageUpload(token);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    fetchAll();
  }, [user, year]);

  const fetchAll = async () => {
    setLoading(true);
    await Promise.all([fetchBookings(), fetchExpenses(), fetchSummary(), fetchPayoutsInitial(), fetchConnectStatus(), fetchCredits(), fetchRecurringExpenses()]);
    setLoading(false);
  };

  const fetchConnectStatus = async () => {
    if (!isSitter) return;
    try {
      const res = await fetch(`${API_BASE}/connect/status`, { headers: getAuthHeaders(token) });
      if (res.ok) {
        const data = await res.json();
        setConnectEnabled(data.stripe_payouts_enabled ?? false);
      }
    } catch {
      // Non-critical
    }
  };

  const fetchCredits = async () => {
    try {
      const [balRes, histRes] = await Promise.all([
        fetch(`${API_BASE}/credits/balance`, { headers: getAuthHeaders(token) }),
        fetch(`${API_BASE}/credits/history?limit=50`, { headers: getAuthHeaders(token) }),
      ]);
      if (balRes.ok) {
        const data = await balRes.json();
        setCreditBalance(data.balance_cents);
      }
      if (histRes.ok) {
        const data = await histRes.json();
        setCreditHistory(data.entries);
      }
    } catch {
      // Non-critical
    }
  };

  const fetchBookings = async () => {
    try {
      const res = await fetch(`${API_BASE}/bookings`, { headers: getAuthHeaders(token) });
      if (res.ok) {
        const data = await res.json();
        setBookings(data.bookings);
      }
    } catch {
      // Non-critical
    }
  };

  const fetchExpenses = async () => {
    try {
      const res = await fetch(`${API_BASE}/expenses?year=${year}`, { headers: getAuthHeaders(token) });
      if (res.ok) {
        const data = await res.json();
        setExpenses(data.expenses);
      }
    } catch {
      setError('Failed to load expenses.');
    }
  };

  const fetchSummary = async (fs?: string) => {
    try {
      const status = fs ?? filingStatus;
      const res = await fetch(`${API_BASE}/expenses/tax-summary?year=${year}&filing_status=${status}`, { headers: getAuthHeaders(token) });
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch {
      // Non-critical
    }
  };

  const fetchPayoutsInitial = async () => {
    try {
      const [payoutsRes, pendingRes] = await Promise.all([
        fetch(`${API_BASE}/payouts?limit=${PAYOUTS_PAGE_SIZE}&offset=0`, { headers: getAuthHeaders(token) }),
        fetch(`${API_BASE}/payouts/pending`, { headers: getAuthHeaders(token) }),
      ]);
      if (payoutsRes.ok) {
        const data = await payoutsRes.json();
        setPayouts(data.payouts);
        setPayoutsOffset(data.payouts.length);
        setHasMorePayouts(data.payouts.length >= PAYOUTS_PAGE_SIZE);
      }
      if (pendingRes.ok) {
        const data = await pendingRes.json();
        setPendingPayouts(data.payouts);
      }
    } catch {
      // Non-critical — payouts tab will show empty
    }
  };

  const fetchMorePayouts = async () => {
    setPayoutsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/payouts?limit=${PAYOUTS_PAGE_SIZE}&offset=${payoutsOffset}`, { headers: getAuthHeaders(token) });
      if (res.ok) {
        const data = await res.json();
        setPayouts(prev => [...prev, ...data.payouts]);
        setPayoutsOffset(prev => prev + data.payouts.length);
        setHasMorePayouts(data.payouts.length >= PAYOUTS_PAGE_SIZE);
      }
    } catch {
      setError('Failed to load more payouts.');
    } finally {
      setPayoutsLoading(false);
    }
  };

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    clearReceiptError();
    const publicUrl = await uploadReceipt(file, 'receipts');
    if (publicUrl) {
      setForm((prev) => ({ ...prev, receipt_url: publicUrl }));
    }
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const handleRemoveReceipt = () => {
    setForm((prev) => ({ ...prev, receipt_url: '' }));
  };

  const handleExpenseSubmit = async () => {
    if (!form.amount || !form.date) return;
    setSaving(true);
    setError(null);
    try {
      const url = editingId ? `${API_BASE}/expenses/${editingId}` : `${API_BASE}/expenses`;
      const method = editingId ? 'PUT' : 'POST';
      const payload = buildExpensePayload(form);
      const res = await fetch(url, {
        method,
        headers: getAuthHeaders(token),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save');
      }
      setShowForm(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
      fetchExpenses();
      fetchSummary();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save expense');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await fetch(`${API_BASE}/expenses/${id}`, { method: 'DELETE', headers: getAuthHeaders(token) });
      fetchExpenses();
      fetchSummary();
    } catch {
      setError('Failed to delete expense.');
    }
  };

  // --- Recurring Expenses ---
  const fetchRecurringExpenses = async () => {
    if (!isSitter) return;
    try {
      const res = await fetch(`${API_BASE}/recurring-expenses`, { headers: getAuthHeaders(token) });
      if (res.ok) {
        const data = await res.json();
        setRecurringExpenses(data.recurring_expenses);
      }
    } catch {
      // Non-critical
    }
  };

  if (authLoading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div></div>;
  if (!user) return <Navigate to="/login" replace />;

  // Earnings: completed bookings where user is sitter (sitter mode) or owner (owner mode)
  const completedBookings = bookings.filter(b => b.status === 'completed');
  const earnings = isSitter
    ? completedBookings.filter(b => b.sitter_id === user.id)
    : completedBookings.filter(b => b.owner_id === user.id);
  const earningsThisYear = earnings.filter(b => new Date(b.start_time).getFullYear() === year);
  const totalEarnings = earningsThisYear.reduce((sum, b) => sum + (b.total_price_cents || 0), 0);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Wallet className="w-6 h-6 text-emerald-600" />
          <h1 className="text-2xl font-bold text-stone-900">Wallet</h1>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="text-sm border border-stone-200 rounded-lg px-3 py-1.5 ml-2">
            {[2026, 2025, 2024].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Connect Status Banner */}
      {isSitter && connectEnabled === false && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Payout setup required</p>
            <p className="text-sm text-amber-700 mt-1">
              Set up your payout account to receive payments from bookings.{' '}
              <Link to="/settings#settings-payouts" className="underline font-medium hover:text-amber-900">
                Go to Settings
              </Link>
            </p>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      {summary && isSitter && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-emerald-50 rounded-xl p-5 border border-emerald-100">
            <div className="flex items-center gap-2 text-emerald-700 text-sm font-medium mb-1">
              <TrendingUp className="w-4 h-4" /> Earnings
            </div>
            <div className="text-2xl font-bold text-emerald-700">{formatCents(summary.total_income)}</div>
          </div>
          <div className="bg-red-50 rounded-xl p-5 border border-red-100">
            <div className="flex items-center gap-2 text-red-700 text-sm font-medium mb-1">
              <TrendingDown className="w-4 h-4" /> Expenses
            </div>
            <div className="text-2xl font-bold text-red-700">{formatCents(summary.total_expenses)}</div>
          </div>
          <div className="bg-stone-50 rounded-xl p-5 border border-stone-200">
            <div className="flex items-center gap-2 text-stone-700 text-sm font-medium mb-1">
              <DollarSign className="w-4 h-4" /> Net Income
            </div>
            <div className={`text-2xl font-bold ${summary.net_income >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {formatCents(summary.net_income)}
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-stone-200 mb-6">
        <button onClick={() => setTab('earnings')}
          className={`px-4 py-2.5 text-sm font-medium transition-colors ${tab === 'earnings' ? 'text-emerald-700 border-b-2 border-emerald-600' : 'text-stone-500 hover:text-stone-700'}`}>
          {isSitter ? 'Earnings' : 'Payments'}
        </button>
        {isSitter && (
          <>
            <button onClick={() => setTab('payouts')}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${tab === 'payouts' ? 'text-emerald-700 border-b-2 border-emerald-600' : 'text-stone-500 hover:text-stone-700'}`}>
              Payouts
            </button>
            <button onClick={() => setTab('expenses')}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${tab === 'expenses' ? 'text-emerald-700 border-b-2 border-emerald-600' : 'text-stone-500 hover:text-stone-700'}`}>
              Expenses
            </button>
            <button onClick={() => setTab('tax')}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${tab === 'tax' ? 'text-emerald-700 border-b-2 border-emerald-600' : 'text-stone-500 hover:text-stone-700'}`}>
              Tax Summary
            </button>
            <button onClick={() => setTab('credits')}
              className={`px-4 py-2.5 text-sm font-medium transition-colors ${tab === 'credits' ? 'text-emerald-700 border-b-2 border-emerald-600' : 'text-stone-500 hover:text-stone-700'}`}>
              Credits
            </button>
          </>
        )}
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} aria-label="Dismiss error" className="text-xs font-medium hover:underline">Dismiss</button>
          </AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div></div>
      ) : (
        <>
          {/* Earnings / Payments Tab */}
          {tab === 'earnings' && (
            <div>
              {earningsThisYear.length === 0 ? (
                <div className="text-center py-12 bg-stone-50 rounded-xl border border-stone-200">
                  <DollarSign className="w-12 h-12 mx-auto mb-4 text-stone-300" />
                  <p className="text-stone-500">No {isSitter ? 'earnings' : 'payments'} for {year}.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {earningsThisYear.map(booking => (
                    <div key={booking.id} className="bg-white rounded-xl border border-stone-100 p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-xs font-bold">
                          {(isSitter ? booking.owner_name : booking.sitter_name)?.charAt(0)?.toUpperCase()}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-stone-900 capitalize">{booking.service_type?.replace(/[-_]/g, ' ')}</div>
                          <div className="text-xs text-stone-400">
                            {isSitter ? booking.owner_name : booking.sitter_name} &middot; {new Date(booking.start_time).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <span className={`text-sm font-bold ${isSitter ? 'text-emerald-600' : 'text-stone-900'}`}>
                        {isSitter ? '+' : '-'}{formatCents(booking.total_price_cents || 0)}
                      </span>
                    </div>
                  ))}
                  <div className="mt-4 p-4 bg-stone-50 rounded-xl border border-stone-200 flex items-center justify-between">
                    <span className="text-sm font-medium text-stone-700">Total ({year})</span>
                    <span className="text-lg font-bold text-emerald-700">{formatCents(totalEarnings)}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Payouts Tab */}
          {tab === 'payouts' && isSitter && (
            <div className="space-y-6">
              {/* Summary Card */}
              {pendingPayouts.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-amber-50 rounded-xl p-5 border border-amber-100">
                    <div className="flex items-center gap-2 text-amber-700 text-sm font-medium mb-1">
                      <Clock className="w-4 h-4" /> Pending Total
                    </div>
                    <div className="text-2xl font-bold text-amber-700">
                      {formatCents(pendingPayouts.reduce((sum, p) => sum + p.amount_cents, 0))}
                    </div>
                    <div className="text-xs text-amber-600 mt-1">
                      {pendingPayouts.length} payout{pendingPayouts.length !== 1 ? 's' : ''} pending
                    </div>
                  </div>
                  <div className="bg-blue-50 rounded-xl p-5 border border-blue-100">
                    <div className="flex items-center gap-2 text-blue-700 text-sm font-medium mb-1">
                      <CreditCard className="w-4 h-4" /> Next Payout
                    </div>
                    <div className="text-2xl font-bold text-blue-700">
                      {formatCents(pendingPayouts[0].amount_cents)}
                    </div>
                    <div className="text-xs text-blue-600 mt-1">
                      Scheduled {new Date(pendingPayouts[0].scheduled_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              )}

              {/* Payouts List */}
              {payouts.length === 0 ? (
                <div className="text-center py-12 bg-stone-50 rounded-xl border border-stone-200">
                  <CreditCard className="w-12 h-12 mx-auto mb-4 text-stone-300" />
                  <p className="text-stone-500">No payouts yet.</p>
                  <p className="text-xs text-stone-400 mt-1">Payouts are scheduled after bookings are completed.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {payouts.map(payout => {
                    const style = PAYOUT_STATUS_STYLES[payout.status];
                    return (
                      <div key={payout.id} className="bg-white rounded-xl border border-stone-100 p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full ${style.bg} flex items-center justify-center`}>
                            <CreditCard className={`w-4 h-4 ${style.text}`} />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-stone-900">
                              Booking #{payout.booking_id}
                            </div>
                            <div className="text-xs text-stone-400">
                              Scheduled {new Date(payout.scheduled_at).toLocaleDateString()}
                              {payout.processed_at && (
                                <> &middot; Processed {new Date(payout.processed_at).toLocaleDateString()}</>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${style.bg} ${style.text}`}>
                            {style.label}
                          </span>
                          <span className="text-sm font-bold text-emerald-600">
                            {formatCents(payout.amount_cents)}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {hasMorePayouts && (
                    <div className="flex justify-center pt-4">
                      <Button variant="outline" size="sm" onClick={fetchMorePayouts} disabled={payoutsLoading}>
                        <ChevronDown className="w-4 h-4" />
                        {payoutsLoading ? 'Loading...' : 'Load More'}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Expenses Tab */}
          {tab === 'expenses' && isSitter && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-stone-900">Expenses</h2>
                {!showForm && (
                  <Button size="sm" onClick={() => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(true); }}>
                    <Plus className="w-4 h-4" /> Add Expense
                  </Button>
                )}
              </div>

              {showForm && (
                <div className="bg-stone-50 rounded-xl border border-stone-200 p-6 mb-6 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-stone-900">{editingId ? 'Edit Expense' : 'Add Expense'}</h3>
                    <button type="button" onClick={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); }} aria-label="Close form" className="text-stone-400 hover:text-stone-600"><X className="w-5 h-5" /></button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
                      className="p-3 border border-stone-200 rounded-lg text-sm">
                      {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
                    </select>
                    <Input type="number" min="0.01" step="0.01" placeholder="Amount ($)" value={form.amount}
                      onChange={e => setForm({ ...form, amount: e.target.value })} />
                    <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
                    <Input placeholder="Description (optional)" value={form.description}
                      onChange={e => setForm({ ...form, description: e.target.value })} />
                  </div>

                  <ReceiptUpload
                    receiptUrl={form.receipt_url}
                    uploading={receiptUploading}
                    error={receiptError}
                    onUpload={handleReceiptUpload}
                    onRemove={handleRemoveReceipt}
                    onPreview={setReceiptPreviewUrl}
                  />

                  <div className="flex gap-2">
                    <Button onClick={handleExpenseSubmit} disabled={saving || receiptUploading || !form.amount}>
                      <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}
                    </Button>
                    <Button variant="outline" onClick={() => { setShowForm(false); setEditingId(null); setForm(EMPTY_FORM); }}>
                      <X className="w-4 h-4" /> Cancel
                    </Button>
                  </div>
                </div>
              )}

              {expenses.length === 0 && !showForm ? (
                <div className="text-center py-12 bg-stone-50 rounded-xl border border-stone-200">
                  <Receipt className="w-12 h-12 mx-auto mb-4 text-stone-300" />
                  <p className="text-stone-500 mb-4">No expenses for {year}.</p>
                  <Button size="sm" onClick={() => setShowForm(true)}><Plus className="w-4 h-4" /> Add Expense</Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {expenses.map(expense => {
                    const info = EXPENSE_CATEGORIES.find(c => c.value === expense.category);
                    return (
                      <div key={expense.id} className="bg-white rounded-xl border border-stone-100 p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-lg">{info?.icon || '📝'}</span>
                          <div>
                            <div className="text-sm font-medium text-stone-900">{info?.label || expense.category}</div>
                            {expense.description && <div className="text-xs text-stone-500">{expense.description}</div>}
                            <div className="text-xs text-stone-400">{new Date(expense.date).toLocaleDateString()}</div>
                          </div>
                          {isReceiptImage(expense.receipt_url) && (
                            <button
                              type="button"
                              onClick={() => setReceiptPreviewUrl(expense.receipt_url!)}
                              className="relative group flex-shrink-0"
                              aria-label="View receipt"
                            >
                              <img
                                src={expense.receipt_url}
                                alt="Receipt"
                                className="w-10 h-10 rounded-lg object-cover border border-stone-200 group-hover:opacity-75 transition-opacity"
                              />
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <ImageIcon className="w-4 h-4 text-stone-700" />
                              </div>
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-bold text-red-600">-{formatCents(expense.amount_cents)}</span>
                          <button onClick={() => { setForm({ category: expense.category, amount: (expense.amount_cents / 100).toString(), description: expense.description || '', date: expense.date.split('T')[0], receipt_url: expense.receipt_url || '' }); setEditingId(expense.id); setShowForm(true); }}
                            className="p-1.5 text-stone-400 hover:text-emerald-600"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setDeleteDialogId(expense.id)}
                            className="p-1.5 text-stone-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Recurring Expenses Section */}
              <RecurringExpensesComponent
                token={token}
                recurringExpenses={recurringExpenses}
                onRefresh={fetchRecurringExpenses}
                onError={setError}
              />
            </div>
          )}

          {/* Tax Summary Tab */}
          {tab === 'tax' && isSitter && summary && (
            <div className="space-y-6">
              {/* Filing status + Export buttons */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-stone-600">Filing status:</label>
                  <select
                    value={filingStatus}
                    onChange={e => { setFilingStatus(e.target.value); fetchSummary(e.target.value); }}
                    className="p-2 border border-stone-200 rounded-lg text-sm"
                  >
                    {FILING_STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => {
                    window.open(`${API_BASE}/expenses/export?year=${year}`, '_blank');
                  }}>
                    <Download className="w-4 h-4" /> CSV
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => generateTaxPDF(summary, EXPENSE_CATEGORIES)}>
                    <FileText className="w-4 h-4" /> PDF
                  </Button>
                </div>
              </div>

              {/* Next quarter callout */}
              {(() => {
                const currentMonth = new Date().getMonth();
                const currentQ = Math.floor(currentMonth / 3);
                const nextQ = summary.quarterly_estimates[currentQ];
                return nextQ && nextQ.estimated_tax > 0 ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-bold text-amber-800">
                        You may owe ~{formatCents(nextQ.estimated_tax)} for {nextQ.quarter}
                      </div>
                      <div className="text-xs text-amber-600 mt-1">Due {nextQ.due_date}. This is a rough estimate — consult a tax professional.</div>
                    </div>
                  </div>
                ) : null;
              })()}

              {/* Annual summary */}
              <div className="bg-white rounded-xl border border-stone-100 p-6">
                <h3 className="font-bold text-stone-900 mb-4">Tax Summary — {year}</h3>
                <div className="space-y-3">
                  <div className="flex justify-between py-2">
                    <span className="text-stone-600">Gross Income (completed bookings)</span>
                    <span className="font-bold text-emerald-700">{formatCents(summary.total_income)}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-stone-600">Total Expenses</span>
                    <span className="font-bold text-red-600">-{formatCents(summary.total_expenses)}</span>
                  </div>
                  <div className="border-t border-stone-200 pt-3 flex justify-between">
                    <span className="font-bold text-stone-900">Net Income</span>
                    <span className={`text-xl font-bold ${summary.net_income >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {formatCents(summary.net_income)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 text-sm">
                    <span className="text-stone-500">Self-Employment Tax (15.3%)</span>
                    <span className="text-stone-700">{formatCents(summary.annual_se_tax)}</span>
                  </div>
                  <div className="flex justify-between py-1 text-sm">
                    <span className="text-stone-500">Estimated Income Tax</span>
                    <span className="text-stone-700">{formatCents(summary.annual_income_tax)}</span>
                  </div>
                  <div className="border-t border-stone-200 pt-3 flex justify-between">
                    <span className="font-bold text-stone-900">Total Estimated Tax</span>
                    <span className="text-lg font-bold text-red-700">{formatCents(summary.annual_estimated_tax)}</span>
                  </div>
                </div>
              </div>

              {/* Quarterly estimates */}
              <div className="bg-white rounded-xl border border-stone-100 p-6">
                <h3 className="font-bold text-stone-900 mb-4">Quarterly Estimated Tax Payments</h3>
                <div className="space-y-3">
                  {summary.quarterly_estimates.map(q => (
                    <div key={q.quarter} className="flex items-center justify-between py-2 border-b border-stone-50 last:border-0">
                      <div>
                        <div className="text-sm font-medium text-stone-900">{q.quarter}</div>
                        <div className="text-xs text-stone-400">Due {q.due_date}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-stone-900">{formatCents(q.estimated_tax)}</div>
                        <div className="text-[10px] text-stone-400">
                          SE {formatCents(q.se_tax)} + Income {formatCents(q.income_tax)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Expenses by category */}
              {Object.keys(summary.expense_by_category).length > 0 && (
                <div className="bg-white rounded-xl border border-stone-100 p-6">
                  <h3 className="font-bold text-stone-900 mb-4">Expenses by Category</h3>
                  <div className="space-y-3">
                    {Object.entries(summary.expense_by_category).map(([cat, amount]) => {
                      const info = EXPENSE_CATEGORIES.find(c => c.value === cat);
                      const pct = summary.total_expenses > 0 ? (amount / summary.total_expenses) * 100 : 0;
                      return (
                        <div key={cat} className="flex items-center gap-3">
                          <span className="text-sm w-6">{info?.icon || '📝'}</span>
                          <span className="text-sm text-stone-700 w-28">{info?.label || cat}</span>
                          <div className="flex-grow bg-stone-100 rounded-full h-2.5">
                            <div className="bg-emerald-500 h-2.5 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-sm font-medium text-stone-900 w-24 text-right">{formatCents(amount)}</span>
                          <span className="text-xs text-stone-400 w-12 text-right">{pct.toFixed(0)}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Disclaimer */}
              <div className="text-xs text-stone-400 text-center px-4">
                For informational purposes only — not tax advice. Tax estimates use simplified 2025 federal brackets
                and do not account for state taxes, deductions beyond the standard deduction, or other income sources.
                Consult a qualified tax professional for accurate tax planning.
              </div>
            </div>
          )}
        </>
      )}

      {/* Credits Tab */}
      {tab === 'credits' && (
        <div className="space-y-4">
          {/* Balance Card */}
          <div className="bg-emerald-50 rounded-xl p-6 border border-emerald-100">
            <div className="flex items-center gap-2 text-emerald-700 text-sm font-medium mb-1">
              <Gift className="w-4 h-4" /> Credit Balance
            </div>
            <div className="text-3xl font-bold text-emerald-700">{formatCents(creditBalance)}</div>
            <p className="text-xs text-emerald-600 mt-2">Credits auto-apply to your subscription renewals</p>
          </div>

          {/* Credit History */}
          {creditHistory.length === 0 ? (
            <div className="text-center py-12 bg-stone-50 rounded-xl border border-stone-200">
              <Gift className="w-12 h-12 mx-auto mb-4 text-stone-300" />
              <p className="text-stone-500">No credit history yet.</p>
              <p className="text-xs text-stone-400 mt-1">Credits from referrals, promotions, and rewards will appear here.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {creditHistory.map(entry => (
                <div key={entry.id} className="bg-white rounded-xl border border-stone-100 p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${entry.amount_cents > 0 ? 'bg-emerald-100' : 'bg-red-100'}`}>
                      {entry.amount_cents > 0
                        ? <TrendingUp className="w-4 h-4 text-emerald-600" />
                        : <TrendingDown className="w-4 h-4 text-red-600" />}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-stone-900">{entry.description}</div>
                      <div className="text-xs text-stone-400">
                        {new Date(entry.created_at).toLocaleDateString()}
                        <span className="ml-2 px-1.5 py-0.5 bg-stone-100 text-stone-500 rounded text-[10px]">
                          {entry.type.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className={`text-sm font-semibold ${entry.amount_cents > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {entry.amount_cents > 0 ? '+' : ''}{formatCents(entry.amount_cents)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <ReceiptPreviewModal url={receiptPreviewUrl} onClose={() => setReceiptPreviewUrl(null)} />

      <AlertDialog open={deleteDialogId !== null} onOpenChange={(open) => { if (!open) setDeleteDialogId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Expense</AlertDialogTitle>
            <AlertDialogDescription>Are you sure? This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => { if (deleteDialogId !== null) handleDelete(deleteDialogId); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
