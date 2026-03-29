import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';

const mockUseAuth = vi.fn();
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('react-router-dom', () => ({
  Navigate: 'Navigate',
}));

import ProtectedRoute from './ProtectedRoute';

describe('ProtectedRoute', () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
  });

  it('redirects to /login when user is null and not loading', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });

    const result = ProtectedRoute({ children: createElement('div', null, 'child') });

    // Returns a Navigate element with to="/login"
    expect(result).not.toBeNull();
    expect((result as any).props.to).toBe('/login');
    expect((result as any).props.replace).toBe(true);
  });

  it('renders children when user is authenticated', () => {
    mockUseAuth.mockReturnValue({
      user: { id: '1', name: 'Test', email: 'test@example.com' },
      loading: false,
    });

    const child = createElement('div', null, 'protected content');
    const result = ProtectedRoute({ children: child });

    // Should not return Navigate
    expect(result).not.toBeNull();
    expect((result as any).props.children).toBe(child);
  });

  it('renders spinner when loading', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });

    const result = ProtectedRoute({ children: createElement('div', null, 'child') });

    // Returns spinner div, not Navigate
    expect(result).not.toBeNull();
    expect((result as any).props.className).toContain('flex');
  });
});
