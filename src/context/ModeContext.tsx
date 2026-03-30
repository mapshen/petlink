import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
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

  const rolesKey = useMemo(
    () => user?.roles?.slice().sort().join(',') ?? '',
    [user?.roles]
  );
  const hasOwner = user?.roles?.includes('owner') ?? false;
  const hasSitter = user?.roles?.includes('sitter') ?? false;
  const canToggle = hasOwner && hasSitter;

  const [mode, setModeState] = useState<Mode>(() => {
    if (!user) return 'owner';
    if (hasOwner && hasSitter) {
      const stored = localStorage.getItem('petlink_mode');
      if (stored === 'owner' || stored === 'sitter') return stored;
      return 'owner';
    }
    if (hasSitter) return 'sitter';
    return 'owner';
  });

  useEffect(() => {
    if (!user) return;
    const owns = user.roles?.includes('owner') ?? false;
    const sits = user.roles?.includes('sitter') ?? false;
    if (owns && sits) {
      const stored = localStorage.getItem('petlink_mode');
      if (stored === 'owner' || stored === 'sitter') {
        setModeState(stored);
      }
    } else if (sits) {
      setModeState('sitter');
    } else {
      setModeState('owner');
    }
  }, [rolesKey]);

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
