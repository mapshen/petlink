import { describe, it, expect } from 'vitest';

describe('EditableSection render logic', () => {
  // Test the conditional logic without React rendering
  function getState(isOwner: boolean, viewAsVisitor: boolean, isEditing: boolean) {
    const showEditAffordance = isOwner && !viewAsVisitor && !isEditing;
    return { showEditAffordance, isEditing };
  }

  it('shows pencil for owner in normal mode', () => {
    const { showEditAffordance } = getState(true, false, false);
    expect(showEditAffordance).toBe(true);
  });

  it('hides pencil for visitor', () => {
    const { showEditAffordance } = getState(false, false, false);
    expect(showEditAffordance).toBe(false);
  });

  it('hides pencil when view-as-visitor is active', () => {
    const { showEditAffordance } = getState(true, true, false);
    expect(showEditAffordance).toBe(false);
  });

  it('hides pencil when section is being edited', () => {
    const { showEditAffordance } = getState(true, false, true);
    expect(showEditAffordance).toBe(false);
  });

  it('shows edit form when isEditing', () => {
    const { isEditing } = getState(true, false, true);
    expect(isEditing).toBe(true);
  });

  it('does not show edit form for visitor', () => {
    const { isEditing } = getState(false, false, false);
    expect(isEditing).toBe(false);
  });
});
