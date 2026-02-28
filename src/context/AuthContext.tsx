import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { API_BASE } from '../config';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string, role?: string) => Promise<void>;
  logout: () => void;
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
        if (err.name === 'AbortError') return;
        localStorage.removeItem('petlink_user');
        localStorage.removeItem('petlink_token');
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, []);

  const login = async (email: string, password: string) => {
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
  };

  const signup = async (email: string, password: string, name: string, role?: string) => {
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
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('petlink_user');
    localStorage.removeItem('petlink_token');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, signup, logout, loading }}>
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
