import React, { useState } from 'react';
import { Plus, Trash2, Pencil, X, Save, Repeat, Pause, Play } from 'lucide-react';
import { getAuthHeaders } from '../../context/AuthContext';
import { API_BASE } from '../../config';
import { RecurringExpense } from '../../types';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { formatCents, dollarsToCents } from '../../lib/money';

const EXPENSE_CATEGORIES = [
  { value: 'supplies', label: 'Supplies', icon: '🛒' },
  { value: 'transportation', label: 'Transportation', icon: '🚗' },
  { value: 'insurance', label: 'Insurance', icon: '🛡️' },
  { value: 'marketing', label: 'Marketing', icon: '📣' },
  { value: 'equipment', label: 'Equipment', icon: '🔧' },
  { value: 'training', label: 'Training', icon: '📚' },
  { value: 'other', label: 'Other', icon: '📝' },
] as const;

interface RecurringExpenseForm {
  category: string;
  amount: string;
  description: string;
  day_of_month: number;
}

const EMPTY_RECURRING_FORM: RecurringExpenseForm = {
  category: 'supplies',
  amount: '',
  description: '',
  day_of_month: 1,
};

export function buildRecurringExpensePayload(form: RecurringExpenseForm) {
  return {
    category: form.category,
    amount_cents: dollarsToCents(Number(form.amount)),
    description: form.description || null,
    day_of_month: form.day_of_month,
  };
}

interface RecurringExpensesProps {
  token: string | null;
  recurringExpenses: RecurringExpense[];
  onRefresh: () => void;
  onError: (msg: string) => void;
}

export default function RecurringExpenses({ token, recurringExpenses, onRefresh, onError }: RecurringExpensesProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<RecurringExpenseForm>(EMPTY_RECURRING_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteDialogId, setDeleteDialogId] = useState<number | null>(null);

  const handleSubmit = async () => {
    if (!form.amount) return;
    setSaving(true);
    try {
      const url = editingId
        ? `${API_BASE}/recurring-expenses/${editingId}`
        : `${API_BASE}/recurring-expenses`;
      const method = editingId ? 'PUT' : 'POST';
      const payload = buildRecurringExpensePayload(form);
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
      setForm(EMPTY_RECURRING_FORM);
      onRefresh();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to save recurring expense');
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (id: number) => {
    try {
      await fetch(`${API_BASE}/recurring-expenses/${id}/toggle`, {
        method: 'PUT',
        headers: getAuthHeaders(token),
      });
      onRefresh();
    } catch {
      onError('Failed to toggle recurring expense.');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await fetch(`${API_BASE}/recurring-expenses/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(token),
      });
      onRefresh();
    } catch {
      onError('Failed to delete recurring expense.');
    }
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_RECURRING_FORM);
  };

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Repeat className="w-5 h-5 text-emerald-600" />
          <h2 className="text-lg font-bold text-stone-900">Recurring Expenses</h2>
        </div>
        {!showForm && (
          <Button size="sm" variant="outline" onClick={() => { setForm(EMPTY_RECURRING_FORM); setEditingId(null); setShowForm(true); }}>
            <Plus className="w-4 h-4" /> Add Recurring
          </Button>
        )}
      </div>
      <p className="text-xs text-stone-500 mb-4">
        Set up expenses that repeat monthly. They will be auto-logged on the day you choose.
      </p>

      {showForm && (
        <div className="bg-stone-50 rounded-xl border border-stone-200 p-6 mb-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-stone-900">{editingId ? 'Edit Recurring Expense' : 'Add Recurring Expense'}</h3>
            <button type="button" onClick={closeForm} aria-label="Close form" className="text-stone-400 hover:text-stone-600">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}
              className="p-3 border border-stone-200 rounded-lg text-sm">
              {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.icon} {c.label}</option>)}
            </select>
            <Input type="number" min="0.01" step="0.01" placeholder="Amount ($)" value={form.amount}
              onChange={e => setForm({ ...form, amount: e.target.value })} />
            <div>
              <label className="text-xs text-stone-500 mb-1 block">Day of Month (1-28)</label>
              <Input type="number" min={1} max={28} value={form.day_of_month}
                onChange={e => setForm({ ...form, day_of_month: Math.min(28, Math.max(1, Number(e.target.value))) })} />
            </div>
            <Input placeholder="Description (optional)" value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSubmit} disabled={saving || !form.amount}>
              <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save'}
            </Button>
            <Button variant="outline" onClick={closeForm}>
              <X className="w-4 h-4" /> Cancel
            </Button>
          </div>
        </div>
      )}

      {recurringExpenses.length === 0 && !showForm ? (
        <div className="text-center py-8 bg-stone-50 rounded-xl border border-stone-200">
          <Repeat className="w-10 h-10 mx-auto mb-3 text-stone-300" />
          <p className="text-stone-500 text-sm mb-3">No recurring expenses set up yet.</p>
          <p className="text-xs text-stone-400 mb-4">Common examples: insurance, car payment, software subscriptions</p>
          <Button size="sm" variant="outline" onClick={() => setShowForm(true)}><Plus className="w-4 h-4" /> Add Recurring</Button>
        </div>
      ) : (
        <div className="space-y-2">
          {recurringExpenses.map(re => {
            const info = EXPENSE_CATEGORIES.find(c => c.value === re.category);
            return (
              <div key={re.id} className={`bg-white rounded-xl border p-4 flex items-center justify-between ${re.active ? 'border-stone-100' : 'border-stone-200 opacity-60'}`}>
                <div className="flex items-center gap-3">
                  <span className="text-lg">{info?.icon || '📝'}</span>
                  <div>
                    <div className="text-sm font-medium text-stone-900">
                      {info?.label || re.category}
                      {!re.active && <span className="ml-2 text-xs text-stone-400 font-normal">(paused)</span>}
                    </div>
                    {re.description && <div className="text-xs text-stone-500">{re.description}</div>}
                    <div className="text-xs text-stone-400">Day {re.day_of_month} of each month</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-red-600">-{formatCents(re.amount_cents)}/mo</span>
                  <button onClick={() => handleToggle(re.id)}
                    className={`p-1.5 ${re.active ? 'text-amber-500 hover:text-amber-600' : 'text-emerald-500 hover:text-emerald-600'}`}
                    title={re.active ? 'Pause' : 'Resume'}>
                    {re.active ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => {
                    setForm({
                      category: re.category,
                      amount: (re.amount_cents / 100).toString(),
                      description: re.description || '',
                      day_of_month: re.day_of_month,
                    });
                    setEditingId(re.id);
                    setShowForm(true);
                  }}
                    className="p-1.5 text-stone-400 hover:text-emerald-600">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setDeleteDialogId(re.id)}
                    className="p-1.5 text-stone-400 hover:text-red-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={deleteDialogId !== null} onOpenChange={(open) => { if (!open) setDeleteDialogId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Recurring Expense</AlertDialogTitle>
            <AlertDialogDescription>This will stop future auto-logging. Already logged expenses will not be affected.</AlertDialogDescription>
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
