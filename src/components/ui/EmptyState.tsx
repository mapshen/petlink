import React from 'react';

interface Props {
  readonly icon: React.ElementType;
  readonly title: string;
  readonly description?: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: Props) {
  return (
    <div className="bg-stone-50 border border-stone-200 rounded-xl p-6 text-center">
      <div className="w-10 h-10 rounded-full bg-stone-200 flex items-center justify-center mx-auto mb-3">
        <Icon className="w-5 h-5 text-stone-500" />
      </div>
      <p className="text-sm font-medium text-stone-600">{title}</p>
      {description && (
        <p className="text-xs text-stone-400 mt-1">{description}</p>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="text-xs text-emerald-600 font-medium mt-3 hover:text-emerald-700 transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
