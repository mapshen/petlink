import { useState, useCallback } from 'react';

interface UseEditableProfileResult {
  editingSection: string | null;
  viewAsVisitor: boolean;
  startEditing: (sectionId: string) => void;
  stopEditing: () => void;
  toggleViewAsVisitor: () => void;
}

export function useEditableProfile(): UseEditableProfileResult {
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [viewAsVisitor, setViewAsVisitor] = useState(false);

  const startEditing = useCallback((sectionId: string) => {
    setEditingSection(sectionId);
    setViewAsVisitor(false);
  }, []);

  const stopEditing = useCallback(() => {
    setEditingSection(null);
  }, []);

  const toggleViewAsVisitor = useCallback(() => {
    setViewAsVisitor(prev => !prev);
    setEditingSection(null);
  }, []);

  return { editingSection, viewAsVisitor, startEditing, stopEditing, toggleViewAsVisitor };
}
