import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createElement } from 'react';

const mockUseAuth = vi.fn();
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock('react-router-dom', () => ({
  Navigate: 'Navigate',
}));

import AdminRoute from './AdminRoute';

describe('AdminRoute', () => {
  beforeEach(() => {
    mockUseAuth.mockReset();
  });

  it('redirects to /dashboard when user is not admin', () => {
    mockUseAuth.mockReturnValue({
      user: { id: '1', name: 'Test', email: 'test@example.com', is_admin: false },
      loading: false,
    });

    const result = AdminRoute({ children: createElement('div', null, 'admin content') });

    expect(result).not.toBeNull();
    expect((result as any).props.to).toBe('/dashboard');
    expect((result as any).props.replace).toBe(true);
  });

  it('redirects to /dashboard when user is null', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: false });

    const result = AdminRoute({ children: createElement('div', null, 'admin content') });

    expect(result).not.toBeNull();
    expect((result as any).props.to).toBe('/dashboard');
    expect((result as any).props.replace).toBe(true);
  });

  it('renders children when user is admin', () => {
    mockUseAuth.mockReturnValue({
      user: { id: '1', name: 'Admin', email: 'admin@example.com', is_admin: true },
      loading: false,
    });

    const child = createElement('div', null, 'admin content');
    const result = AdminRoute({ children: child });

    expect(result).not.toBeNull();
    expect((result as any).props.children).toBe(child);
  });

  it('renders spinner when loading', () => {
    mockUseAuth.mockReturnValue({ user: null, loading: true });

    const result = AdminRoute({ children: createElement('div', null, 'admin content') });

    expect(result).not.toBeNull();
    expect((result as any).props.className).toContain('flex');
  });
});
