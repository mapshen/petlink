import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle, Circle, ArrowRight } from 'lucide-react';
import { OnboardingStatus } from '../hooks/useOnboardingStatus';

interface OnboardingChecklistProps {
  status: OnboardingStatus;
  onDismiss?: () => void;
}

const CHECKLIST_ITEMS = [
  { key: 'hasProfile' as const, label: 'Add your bio' },
  { key: 'hasServices' as const, label: 'Set up services & pricing' },
  { key: 'hasPhoto' as const, label: 'Upload a profile photo' },
  { key: 'hasVerification' as const, label: 'Start verification' },
];

export default function OnboardingChecklist({ status, onDismiss }: OnboardingChecklistProps) {
  const pct = Math.round((status.completedCount / 4) * 100);
  const requiredDone = status.hasProfile && status.hasServices;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-bold text-stone-900">Complete Your Sitter Profile</h2>
        <span className="text-sm text-stone-400">{status.completedCount}/4 done</span>
      </div>

      <div className="w-full bg-stone-100 rounded-full h-2 mb-5">
        <div
          className="bg-emerald-500 h-2 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="space-y-3 mb-5">
        {CHECKLIST_ITEMS.map((item) => {
          const done = status[item.key];
          return (
            <div key={item.key} className="flex items-center gap-3">
              {done ? (
                <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
              ) : (
                <Circle className="w-5 h-5 text-stone-300 flex-shrink-0" />
              )}
              <span className={`text-sm ${done ? 'text-stone-400 line-through' : 'text-stone-700'}`}>
                {item.label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <Link
          to="/onboarding"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors"
        >
          Continue Setup
          <ArrowRight className="w-4 h-4" />
        </Link>
        {requiredDone && onDismiss && (
          <button
            onClick={onDismiss}
            className="text-sm text-stone-400 hover:text-stone-600"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
