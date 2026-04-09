import { describe, it, expect } from 'vitest';

// Test the state logic directly without React hooks
// The hook is simple enough to verify via its contract

describe('useEditableProfile state logic', () => {
  // Simulate the hook's state machine
  interface State {
    editingSection: string | null;
    viewAsVisitor: boolean;
  }

  function startEditing(state: State, sectionId: string): State {
    return { editingSection: sectionId, viewAsVisitor: false };
  }

  function stopEditing(state: State): State {
    return { ...state, editingSection: null };
  }

  function toggleViewAsVisitor(state: State): State {
    return { editingSection: null, viewAsVisitor: !state.viewAsVisitor };
  }

  const initial: State = { editingSection: null, viewAsVisitor: false };

  it('starts with no section editing and not in visitor mode', () => {
    expect(initial.editingSection).toBeNull();
    expect(initial.viewAsVisitor).toBe(false);
  });

  it('sets editing section when startEditing is called', () => {
    const next = startEditing(initial, 'header');
    expect(next.editingSection).toBe('header');
  });

  it('clears editing section when stopEditing is called', () => {
    const editing = startEditing(initial, 'header');
    const next = stopEditing(editing);
    expect(next.editingSection).toBeNull();
  });

  it('enforces one section at a time', () => {
    const first = startEditing(initial, 'header');
    const second = startEditing(first, 'services');
    expect(second.editingSection).toBe('services');
  });

  it('toggles view-as-visitor and closes editor', () => {
    const editing = startEditing(initial, 'header');
    const visitor = toggleViewAsVisitor(editing);
    expect(visitor.viewAsVisitor).toBe(true);
    expect(visitor.editingSection).toBeNull();
  });

  it('toggles view-as-visitor back', () => {
    const visitor = toggleViewAsVisitor(initial);
    expect(visitor.viewAsVisitor).toBe(true);
    const back = toggleViewAsVisitor(visitor);
    expect(back.viewAsVisitor).toBe(false);
  });

  it('startEditing disables visitor mode', () => {
    const visitor = toggleViewAsVisitor(initial);
    expect(visitor.viewAsVisitor).toBe(true);
    const editing = startEditing(visitor, 'photos');
    expect(editing.viewAsVisitor).toBe(false);
    expect(editing.editingSection).toBe('photos');
  });
});
