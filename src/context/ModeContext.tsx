import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

type Mode = 'owner' | 'sitter';

interface ModeContextType {
  mode: Mode;
  setMode: (mode: Mode) => void;
  canToggle: boolean;
}

const ModeContext = createContext<ModeContextType>({
  mode: 'owner',
  setMode: () => {},
  canToggle: false,
});

export function ModeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  const canToggle = user?.role === 'both';

  const [mode, setModeState] = useState<Mode>(() => {
    if (!user) return 'owner';
    if (user.role === 'owner') return 'owner';
    if (user.role === 'sitter') return 'sitter';
    const stored = localStorage.getItem('petlink_mode');
    if (stored === 'owner' || stored === 'sitter') return stored;
    return 'owner';
  });

  // Sync mode when user/role changes
  useEffect(() => {
    if (!user) return;
    if (user.role === 'owner') {
      setModeState('owner');
    } else if (user.role === 'sitter') {
      setModeState('sitter');
    } else {
      // role === 'both' — restore from localStorage or default to owner
      const stored = localStorage.getItem('petlink_mode');
      if (stored === 'owner' || stored === 'sitter') {
        setModeState(stored);
      }
    }
  }, [user?.role]);

  const setMode = useCallback((newMode: Mode) => {
    setModeState(newMode);
    localStorage.setItem('petlink_mode', newMode);
  }, []);

  return (
    <ModeContext.Provider value={{ mode, setMode, canToggle }}>
      {children}
    </ModeContext.Provider>
  );
}

export function useMode() {
  return useContext(ModeContext);
}
