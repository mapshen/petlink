import { useState, useCallback } from 'react';

export const MAP_VIEW_STORAGE_KEY = 'petlink_map_view';

export type MapView = 'list' | 'map' | 'split';

const VALID_VIEWS: ReadonlySet<string> = new Set(['list', 'map', 'split']);

export function getMapViewPreference(): MapView {
  try {
    const stored = localStorage.getItem(MAP_VIEW_STORAGE_KEY);
    if (stored && VALID_VIEWS.has(stored)) return stored as MapView;
  } catch {
    // SSR or localStorage unavailable
  }
  return 'list';
}

export function setMapViewPreference(view: MapView): void {
  try {
    localStorage.setItem(MAP_VIEW_STORAGE_KEY, view);
  } catch {
    // SSR or localStorage unavailable
  }
}

export function useMapViewPreference() {
  const [view, setViewState] = useState<MapView>(getMapViewPreference);

  const setView = useCallback((v: MapView) => {
    setMapViewPreference(v);
    setViewState(v);
  }, []);

  return { view, setView } as const;
}
