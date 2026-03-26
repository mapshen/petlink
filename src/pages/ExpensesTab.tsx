import React, { useState, useEffect } from 'react';
import { useAuth, getAuthHeaders } from '../context/AuthContext';
import { Plus, Trash2, Pencil, X, Save, DollarSign, TrendingUp, TrendingDown, Receipt } from 'lucide-react';
import { API_BASE } from '../config';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Alert, AlertDescription } from '../components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';

const CATEGORIES = [
  { value: 'supplies', label: 'Supplies', icon: '🛒' },
  { value: 'transportation', label: 'Transportation', icon: '🚗' },
  { value: 'insurance', label: 'Insurance', icon: '🛡️' },
  { value: 'marketing', label: 'Marketing', icon: '📣' },
  { value: 'equipment', label: 'Equipment', icon: '🔧' },
  { value: 'training', label: 'Training', icon: '📚' },
  { value: 'other', label: 'Other', icon: '📝' },
] as const;

interface Expense {
  id: number;
  category: string;
  amount: number;
  description?: string;
  date: string;
  receipt_url?: string;
}

interface TaxSummary {
  year: number;
  total_income: number;
  total_expenses: number;
  net_income: number;
  expense_by_category: Record<string, number>;
}

interface ExpenseForm {
  category: string;
  amount: string;
  description: string;
  date: string;
}

const EMPTY_FORM: ExpenseForm = { category: 'supplies', amount: '', description: '', date: new Date().toISOString().split('T')[0] };

export default function ExpensesTab() {
  const { token } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [summary, setSummary] = useState<TaxSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ExpenseForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteDialogId, setDeleteDialogId] = useState<number | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());

  useEffect(() => {
    fetchExpenses();
    fetchSummary();
  }, [year]);

  const fetchExpenses = async () => {
    try {
      const res = await fetch(`${API_BASE}/expenses?year=${year}`, { headers: getAuthHeaders(token) });
      if (res.ok) {
        const data = await res.json();
        setExpenses(data.expenses);
      }
    } catch {
      setError('Failed to load expenses.');
    } finally {
      setLoading(false);
    }
  };

  const fetchSummary = async () => {
    try {
      const res = await fetch(`${API_BASE}/expenses/tax-summary?year=${year}`, { headers: getAuthHeaders(token) });
      if (res.ok) {
        const data = await res.json();
        setSummary(data.summary);
      }
    } catch {
      // Non-critical
    }
  };

  const handleSubmit = async () => {
    if (!form.amount || !form.date) return;
    setSaving(true);
    setError(null);
    const payload = { category: form.category, amount: Number(form.amount), description: form.description || null, date: form.date };

    try {
      const url = editingId ? `${API_BASE}/expenses/${editingId}` : `${API_BASE}/expenses`;
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: getAuthHeaders(token), body: JSON.stringify(payload) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save expense');
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

  const startEdit = (expense: Expense) => {
    setForm({ category: expense.category, amount: expense.amount.toString(), description: expense.description || '', date: expense.date.split('T')[0] });
    setEditingId(expense.id);
    setShowForm(true);
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

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const formatCurrency = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (loading) return <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div></div>;

  return (
    <div>
      {/* Tax Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
            <div className="flex items-center gap-2 text-emerald-700 text-sm font-medium mb-1">
              <TrendingUp className="w-4 h-4" /> Income
            </div>
            <div className="text-2xl font-bold text-emerald-700">{formatCurrency(summary.total_income)}</div>
          </div>
          <div className="bg-red-50 rounded-xl p-4 border border-red-100">
            <div className="flex items-center gap-2 text-red-700 text-sm font-medium mb-1">
              <TrendingDown className="w-4 h-4" /> Expenses
            </div>
            <div className="text-2xl font-bold text-red-700">{formatCurrency(summary.total_expenses)}</div>
          </div>
          <div className="bg-stone-50 rounded-xl p-4 border border-stone-200">
            <div className="flex items-center gap-2 text-stone-700 text-sm font-medium mb-1">
              <DollarSign className="w-4 h-4" /> Net Income
            </div>
            <div className={`text-2xl font-bold ${summary.net_income >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {formatCurrency(summary.net_income)}
            </div>
          </div>
        </div>
      )}

      {/* Category Breakdown */}
      {summary && Object.keys(summary.expense_by_category).length > 0 && (
        <div className="bg-white rounded-xl border border-stone-100 p-4 mb-6">
          <h3 className="text-sm font-bold text-stone-900 mb-3">Expenses by Category</h3>
          <div className="space-y-2">
            {Object.entries(summary.expense_by_category).map(([cat, amount]) => {
              const info = CATEGORIES.find(c => c.value === cat);
              const pct = summary.total_expenses > 0 ? (amount / summary.total_expenses) * 100 : 0;
              return (
                <div key={cat} className="flex items-center gap-3">
                  <span className="text-sm w-6">{info?.icon || '📝'}</span>
                  <span className="text-sm text-stone-700 w-28">{info?.label || cat}</span>
                  <div className="flex-grow bg-stone-100 rounded-full h-2">
                    <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-sm font-medium text-stone-900 w-20 text-right">{formatCurrency(amount)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-stone-900">Expenses</h2>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="text-sm border border-stone-200 rounded-lg px-2 py-1">
            {[2026, 2025, 2024].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        {!showForm && (
          <Button size="sm" onClick={() => { setForm(EMPTY_FORM); setEditingId(null); setShowForm(true); }}>
            <Plus className="w-4 h-4" /> Add Expense
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription className="flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-xs font-medium hover:underline">Dismiss</button>
          </AlertDescription>
        </Alert>
      )}

      {/* Add/Edit Form */}
      {showForm && (
        <div className="bg-stone-50 rounded-xl border border-stone-200 p-6 mb-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-stone-900">{editingId ? 'Edit Expense' : 'Add Expense'}</h3>
            <button type="button" onClick={cancelForm} className="text-stone-400 hover:text-stone-600"><X className="w-5 h-5" /></button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
              className="p-3 border border-stone-200 rounded-lg text-sm">
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
            </select>
            <Input type="number" min="0.01" step="0.01" placeholder="Amount ($)" value={form.amount}
              onChange={e => setForm({ ...form, amount: e.target.value })} />
            <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
            <Input placeholder="Description (optional)" value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSubmit} disabled={saving || !form.amount}>
              <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}
            </Button>
            <Button variant="outline" onClick={cancelForm}><X className="w-4 h-4" /> Cancel</Button>
          </div>
        </div>
      )}

      {/* Expense List */}
      {expenses.length === 0 && !showForm ? (
        <div className="text-center py-12 bg-stone-50 rounded-xl border border-stone-200">
          <Receipt className="w-12 h-12 mx-auto mb-4 text-stone-300" />
          <p className="text-stone-500 mb-4">No expenses recorded for {year}.</p>
          <Button size="sm" onClick={() => setShowForm(true)}><Plus className="w-4 h-4" /> Add Expense</Button>
        </div>
      ) : (
        <div className="space-y-2">
          {expenses.map(expense => {
            const info = CATEGORIES.find(c => c.value === expense.category);
            return (
              <div key={expense.id} className="bg-white rounded-xl border border-stone-100 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-lg">{info?.icon || '📝'}</span>
                  <div>
                    <div className="text-sm font-medium text-stone-900">{info?.label || expense.category}</div>
                    {expense.description && <div className="text-xs text-stone-500">{expense.description}</div>}
                    <div className="text-xs text-stone-400">{new Date(expense.date).toLocaleDateString()}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-stone-900">{formatCurrency(expense.amount)}</span>
                  <button onClick={() => startEdit(expense)} className="p-1.5 text-stone-400 hover:text-emerald-600"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setDeleteDialogId(expense.id)} className="p-1.5 text-stone-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}

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
