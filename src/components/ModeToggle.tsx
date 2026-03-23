import React from 'react';
import { useMode } from '../context/ModeContext';

export default function ModeToggle() {
  const { mode, setMode, canToggle } = useMode();

  if (!canToggle) return null;

  return (
    <div className="bg-stone-100 rounded-lg p-0.5 flex w-[140px]">
      <button
        onClick={() => setMode('owner')}
        className={`flex-1 py-1 rounded-md text-xs font-semibold text-center transition-all ${
          mode === 'owner'
            ? 'bg-emerald-600 text-white shadow-sm'
            : 'text-stone-500 hover:text-stone-700'
        }`}
      >
        Owner
      </button>
      <button
        onClick={() => setMode('sitter')}
        className={`flex-1 py-1 rounded-md text-xs font-semibold text-center transition-all ${
          mode === 'sitter'
            ? 'bg-emerald-600 text-white shadow-sm'
            : 'text-stone-500 hover:text-stone-700'
        }`}
      >
        Sitter
      </button>
    </div>
  );
}
