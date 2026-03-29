import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { User, OAuthProvider } from '../types';
import { API_BASE } from '../config';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string, role?: string) => Promise<void>;
  loginWithOAuth: (provider: OAuthProvider, token: string) => Promise<{ isNewUser: boolean }>;
  logout: () => void;
  updateUser: (user: User) => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getAuthHeaders(token: string | null): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export { getAuthHeaders };

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    const storedToken = localStorage.getItem('petlink_token');
    const storedUser = localStorage.getItem('petlink_user');
    if (!storedToken || !storedUser) {
      setLoading(false);
      return;
    }

    try {
      JSON.parse(storedUser);
    } catch {
      localStorage.removeItem('petlink_user');
      localStorage.removeItem('petlink_token');
      setLoading(false);
      return;
    }

    let aborted = false;
    fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${storedToken}` },
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error('Token invalid');
        return res.json();
      })
      .then((data) => {
        setToken(storedToken);
        setUser(data.user);
        localStorage.setItem('petlink_user', JSON.stringify(data.user));
      })
      .catch((err) => {
        if (err.name === 'AbortError') { aborted = true; return; }
        localStorage.removeItem('petlink_user');
        localStorage.removeItem('petlink_token');
      })
      .finally(() => { if (!aborted) setLoading(false); });

    return () => controller.abort();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Login failed');
    }

    const data = await res.json();
    setUser(data.user);
    setToken(data.token);
    localStorage.setItem('petlink_user', JSON.stringify(data.user));
    localStorage.setItem('petlink_token', data.token);
  }, []);

  const signup = useCallback(async (email: string, password: string, name: string, role?: string) => {
    const res = await fetch(`${API_BASE}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name, role }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Signup failed');
    }

    const data = await res.json();
    setUser(data.user);
    setToken(data.token);
    localStorage.setItem('petlink_user', JSON.stringify(data.user));
    localStorage.setItem('petlink_token', data.token);
  }, []);

  const loginWithOAuth = useCallback(async (provider: OAuthProvider, oauthToken: string): Promise<{ isNewUser: boolean }> => {
    const res = await fetch(`${API_BASE}/auth/oauth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, token: oauthToken }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'OAuth login failed');
    }

    const data = await res.json();
    setUser(data.user);
    setToken(data.token);
    localStorage.setItem('petlink_user', JSON.stringify(data.user));
    localStorage.setItem('petlink_token', data.token);
    return { isNewUser: data.isNewUser || false };
  }, []);

  const updateUser = useCallback((updatedUser: User) => {
    setUser(updatedUser);
    localStorage.setItem('petlink_user', JSON.stringify(updatedUser));
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('petlink_user');
    localStorage.removeItem('petlink_token');
    localStorage.removeItem('petlink_mode');
  }, []);

  const value = useMemo(() => ({
    user, token, login, signup, loginWithOAuth, logout, updateUser, loading,
  }), [user, token, login, signup, loginWithOAuth, logout, updateUser, loading]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
