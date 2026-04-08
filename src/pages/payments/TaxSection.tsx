import React, { useState, useEffect } from 'react';
import { Download, FileText, AlertCircle } from 'lucide-react';
import { API_BASE } from '../../config';
import { getAuthHeaders } from '../../context/AuthContext';
import { Button } from '../../components/ui/button';
import { formatCents } from '../../lib/money';
import { generateTaxPDF } from '../../lib/tax-pdf';
import type { TaxSummary } from './walletTypes';
import { EXPENSE_CATEGORIES, FILING_STATUS_OPTIONS } from './expenseConstants';

interface TaxSectionProps {
  year: number;
  token: string | null;
}

export default function TaxSection({ year, token }: TaxSectionProps) {
  const [summary, setSummary] = useState<TaxSummary | null>(null);
  const [filingStatus, setFilingStatus] = useState('single');
  const [loading, setLoading] = useState(true);

  const fetchSummary = async (fs?: string) => {
    setLoading(true);
    try {
      const status = fs ?? filingStatus;
      const res = await fetch(`${API_BASE}/expenses/tax-summary?year=${year}&filing_status=${status}`, { headers: getAuthHeaders(token) });
      if (res.ok) {
        const data = await res.json();
        setSummary(data);
      }
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
  }, [year]);

  const handleExportCSV = async () => {
    const csvRes = await fetch(`${API_BASE}/expenses/export?year=${year}`, { headers: getAuthHeaders(token) });
    if (csvRes.ok) {
      const blob = await csvRes.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `expenses-${year}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleExportPDF = () => {
    if (summary) {
      generateTaxPDF(summary, EXPENSE_CATEGORIES);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (!summary) return null;

  const currentMonth = new Date().getMonth();
  const currentQIndex = Math.floor(currentMonth / 3);
  const currentQuarter = summary.quarterly_estimates[currentQIndex];

  return (
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
          <Button size="sm" variant="outline" onClick={handleExportCSV}>
            <Download className="w-4 h-4" /> CSV
          </Button>
          <Button size="sm" variant="outline" onClick={handleExportPDF}>
            <FileText className="w-4 h-4" /> PDF
          </Button>
        </div>
      </div>

      {/* Next quarter callout */}
      {currentQuarter && currentQuarter.estimated_tax > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div>
            <div className="text-sm font-bold text-amber-800">
              Estimated {currentQuarter.quarter} tax: ~{formatCents(currentQuarter.estimated_tax)}
            </div>
            <div className="text-xs text-amber-600 mt-1">Due {currentQuarter.due_date}. This is a rough estimate — consult a tax professional.</div>
          </div>
        </div>
      )}

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
  );
}
