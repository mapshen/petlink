import React, { useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useMode } from '../../context/ModeContext';

export default function ModeToggle() {
  const { mode, setMode, canToggle } = useMode();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleModeChange = useCallback((newMode: 'owner' | 'sitter') => {
    setMode(newMode);
    if (!user?.slug) return;
    const isOnOwnProfile =
      location.pathname === `/sitter/${user.slug}` ||
      location.pathname === `/owner/${user.slug}`;
    if (isOnOwnProfile) {
      const target = newMode === 'sitter' ? `/sitter/${user.slug}` : `/owner/${user.slug}`;
      navigate(target, { replace: true });
    }
  }, [setMode, user?.slug, location.pathname, navigate]);

  if (!canToggle) return null;

  return (
    <div className="bg-stone-100 rounded-lg p-0.5 flex w-[140px]" role="radiogroup" aria-label="Account mode">
      <button
        role="radio"
        aria-checked={mode === 'owner'}
        onClick={() => handleModeChange('owner')}
        className={`flex-1 py-1 rounded-md text-xs font-semibold text-center transition-all ${
          mode === 'owner'
            ? 'bg-emerald-600 text-white shadow-sm'
            : 'text-stone-500 hover:text-stone-700'
        }`}
      >
        Owner
      </button>
      <button
        role="radio"
        aria-checked={mode === 'sitter'}
        onClick={() => handleModeChange('sitter')}
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
