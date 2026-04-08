import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Pencil, X, Save, Receipt, ImageIcon } from 'lucide-react';
import { format } from 'date-fns';
import { API_BASE } from '../../config';
import { getAuthHeaders } from '../../context/AuthContext';
import { RecurringExpense } from '../../types';
import RecurringExpensesComponent from '../../components/payment/RecurringExpenses';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
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
import { formatCents } from '../../lib/money';
import { useImageUpload } from '../../hooks/useImageUpload';
import ReceiptUpload from '../../components/payment/ReceiptUpload';
import ReceiptPreviewModal from '../../components/payment/ReceiptPreviewModal';
import type { Expense, ExpenseForm } from './walletTypes';
import { EXPENSE_CATEGORIES, EMPTY_FORM } from './expenseConstants';
import { buildExpensePayload, isReceiptImage } from './expenseUtils';

interface ExpensesSectionProps {
  readonly year: number;
  readonly token: string | null;
}

export default function ExpensesSection({ year, token }: ExpensesSectionProps) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingAutoLogged, setEditingAutoLogged] = useState(false);
  const [form, setForm] = useState<ExpenseForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogId, setDeleteDialogId] = useState<number | null>(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>([]);

  const { uploading: receiptUploading, upload: uploadReceipt, error: receiptError, clearError: clearReceiptError } = useImageUpload(token);

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

  const fetchRecurringExpenses = async () => {
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

  useEffect(() => {
    fetchExpenses();
    fetchRecurringExpenses();
  }, [year, token]);

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    clearReceiptError();
    const publicUrl = await uploadReceipt(file, 'receipts');
    if (publicUrl) {
      setForm((prev) => ({ ...prev, receipt_url: publicUrl }));
    }
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
      setEditingAutoLogged(false);
      setForm(EMPTY_FORM);
      fetchExpenses();
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
    } catch {
      setError('Failed to delete expense.');
    }
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setEditingAutoLogged(false);
    setForm(EMPTY_FORM);
  };

  const openEdit = (expense: Expense) => {
    setForm({
      category: expense.category,
      amount: (expense.amount_cents / 100).toString(),
      description: expense.description || '',
      date: expense.date.split('T')[0],
      receipt_url: expense.receipt_url || '',
    });
    setEditingId(expense.id);
    setEditingAutoLogged(!!expense.auto_logged);
    setShowForm(true);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-stone-900">Expenses</h2>
        {!showForm && (
          <Button size="sm" onClick={() => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(true); }}>
            <Plus className="w-4 h-4" /> Add Expense
          </Button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-xs font-medium hover:underline">Dismiss</button>
        </div>
      )}

      {showForm && (
        <div className="bg-stone-50 rounded-xl border border-stone-200 p-6 mb-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-stone-900">{editingId ? 'Edit Expense' : 'Add Expense'}</h3>
            <button type="button" onClick={closeForm} aria-label="Close form" className="text-stone-400 hover:text-stone-600"><X className="w-5 h-5" /></button>
          </div>
          {editingAutoLogged && (
            <p className="text-xs text-stone-400">Auto-logged expenses: only description and receipt are editable.</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
              disabled={editingAutoLogged}
              className={`p-3 border border-stone-200 rounded-lg text-sm ${editingAutoLogged ? 'opacity-50 cursor-not-allowed' : ''}`}>
              {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
            </select>
            <Input type="number" min="0.01" step="0.01" placeholder="Amount ($)" value={form.amount}
              onChange={e => setForm({ ...form, amount: e.target.value })}
              disabled={editingAutoLogged} className={editingAutoLogged ? 'opacity-50 cursor-not-allowed' : ''} />
            <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}
              disabled={editingAutoLogged} className={editingAutoLogged ? 'opacity-50 cursor-not-allowed' : ''} />
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
            <Button variant="outline" onClick={closeForm}>
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
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-stone-900">{info?.label || expense.category}</span>
                      {expense.auto_logged && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-100 text-stone-400 border border-stone-200 font-medium">Auto</span>
                      )}
                    </div>
                    {expense.description && <div className="text-xs text-stone-500">{expense.description}</div>}
                    <div className="text-xs text-stone-400">{format(new Date(expense.date), 'MMM d, yyyy')}</div>
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
                  <button onClick={() => openEdit(expense)}
                    className="p-1.5 text-stone-400 hover:text-emerald-600"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setDeleteDialogId(expense.id)}
                    className="p-1.5 text-stone-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <RecurringExpensesComponent
        token={token}
        recurringExpenses={recurringExpenses}
        onRefresh={fetchRecurringExpenses}
        onError={setError}
      />

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
