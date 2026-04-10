import { describe, it, expect } from 'vitest';

/**
 * Pure logic tests for ProfileViewHeader toggle visibility.
 * Tests the conditional rendering logic without React rendering.
 */

interface HeaderToggleState {
  isOwner: boolean;
  viewAsVisitor: boolean;
  hasToggleCallback: boolean;
}

function getHeaderDisplay(state: HeaderToggleState) {
  const { isOwner, viewAsVisitor, hasToggleCallback } = state;

  if (isOwner && !viewAsVisitor && hasToggleCallback) {
    return 'view-as-visitor-toggle';
  }
  if (isOwner && !viewAsVisitor && !hasToggleCallback) {
    return 'your-profile-badge';
  }
  if (isOwner && viewAsVisitor && hasToggleCallback) {
    return 'back-to-editing-toggle';
  }
  return 'none';
}

describe('ProfileViewHeader toggle logic', () => {
  it('shows "View as visitor" toggle when owner with callback', () => {
    expect(getHeaderDisplay({ isOwner: true, viewAsVisitor: false, hasToggleCallback: true }))
      .toBe('view-as-visitor-toggle');
  });

  it('shows static "Your profile" badge when owner without callback', () => {
    expect(getHeaderDisplay({ isOwner: true, viewAsVisitor: false, hasToggleCallback: false }))
      .toBe('your-profile-badge');
  });

  it('shows "Back to editing" toggle in visitor mode', () => {
    expect(getHeaderDisplay({ isOwner: true, viewAsVisitor: true, hasToggleCallback: true }))
      .toBe('back-to-editing-toggle');
  });

  it('shows nothing for non-owner visitors', () => {
    expect(getHeaderDisplay({ isOwner: false, viewAsVisitor: false, hasToggleCallback: false }))
      .toBe('none');
  });

  it('shows nothing for non-owner even with toggle callback', () => {
    expect(getHeaderDisplay({ isOwner: false, viewAsVisitor: false, hasToggleCallback: true }))
      .toBe('none');
  });
});
