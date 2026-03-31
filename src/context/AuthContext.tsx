import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { User, OAuthProvider } from '../types';
import { API_BASE } from '../config';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (
    email: string,
    password: string,
    name: string,
    ageConfirmed?: boolean,
  ) => Promise<void>;
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

function decodeJwtPayload(jwt: string): { exp?: number } | null {
  try {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;
    return JSON.parse(atob(parts[1]));
  } catch {
    return null;
  }
}

function isTokenExpiringSoon(jwt: string, thresholdMs = 2 * 60 * 1000): boolean {
  const payload = decodeJwtPayload(jwt);
  if (!payload?.exp) return true;
  return payload.exp * 1000 - Date.now() < thresholdMs;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshingRef = React.useRef(false);

  const refreshAccessToken = useCallback(async (): Promise<string | null> => {
    const storedRefreshToken = localStorage.getItem('petlink_refresh_token');
    if (!storedRefreshToken || refreshingRef.current) return null;

    refreshingRef.current = true;
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: storedRefreshToken }),
      });

      if (!res.ok) {
        localStorage.removeItem('petlink_token');
        localStorage.removeItem('petlink_refresh_token');
        localStorage.removeItem('petlink_user');
        setUser(null);
        setToken(null);
        return null;
      }

      const data = await res.json();
      localStorage.setItem('petlink_token', data.token);
      localStorage.setItem('petlink_refresh_token', data.refreshToken);
      setToken(data.token);
      return data.token;
    } catch {
      return null;
    } finally {
      refreshingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const storedToken = localStorage.getItem('petlink_token');
    const storedUser = localStorage.getItem('petlink_user');
    const storedRefreshToken = localStorage.getItem('petlink_refresh_token');

    if (!storedToken && !storedRefreshToken) {
      setLoading(false);
      return;
    }

    if (!storedUser && !storedRefreshToken) {
      localStorage.removeItem('petlink_token');
      setLoading(false);
      return;
    }

    if (storedUser) {
      try {
        JSON.parse(storedUser);
      } catch {
        localStorage.removeItem('petlink_user');
        localStorage.removeItem('petlink_token');
        localStorage.removeItem('petlink_refresh_token');
        setLoading(false);
        return;
      }
    }

    // If access token is expired/missing but refresh token exists, try refresh first
    const accessExpired = !storedToken || isTokenExpiringSoon(storedToken, 0);
    if (accessExpired && storedRefreshToken) {
      refreshAccessToken()
        .then((newToken) => {
          if (!newToken) {
            setLoading(false);
            return;
          }
          return fetch(`${API_BASE}/auth/me`, {
            headers: { Authorization: `Bearer ${newToken}` },
            signal: controller.signal,
          });
        })
        .then((res) => {
          if (!res) return null;
          if (!res.ok) throw new Error('Token invalid');
          return res.json();
        })
        .then((data) => {
          if (!data) return;
          setUser(data.user);
          localStorage.setItem('petlink_user', JSON.stringify(data.user));
        })
        .catch((err) => {
          if (err.name === 'AbortError') return;
          localStorage.removeItem('petlink_user');
          localStorage.removeItem('petlink_token');
          // Keep refresh token so next periodic refresh can retry
          setUser(null);
          setToken(null);
        })
        .finally(() => setLoading(false));
      return () => controller.abort();
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
        localStorage.removeItem('petlink_refresh_token');
      })
      .finally(() => { if (!aborted) setLoading(false); });

    return () => controller.abort();
  }, [refreshAccessToken]);

  // Periodic token refresh: check every 60s, refresh if <2min remaining
  useEffect(() => {
    if (!token) return;

    const interval = setInterval(() => {
      const currentToken = localStorage.getItem('petlink_token');
      if (currentToken && isTokenExpiringSoon(currentToken)) {
        refreshAccessToken();
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, [token, refreshAccessToken]);

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
    if (data.refreshToken) {
      localStorage.setItem('petlink_refresh_token', data.refreshToken);
    }
  }, []);

  const signup = useCallback(
    async (email: string, password: string, name: string, ageConfirmed?: boolean) => {
      const res = await fetch(`${API_BASE}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name, age_confirmed: ageConfirmed }),
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
      if (data.refreshToken) {
        localStorage.setItem('petlink_refresh_token', data.refreshToken);
      }
    },
    [],
  );

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
    if (data.refreshToken) {
      localStorage.setItem('petlink_refresh_token', data.refreshToken);
    }
    return { isNewUser: data.isNewUser || false };
  }, []);

  const updateUser = useCallback((updatedUser: User) => {
    setUser(updatedUser);
    localStorage.setItem('petlink_user', JSON.stringify(updatedUser));
  }, []);

  const logout = useCallback(() => {
    const currentToken = localStorage.getItem('petlink_token');
    const storedRefreshToken = localStorage.getItem('petlink_refresh_token');
    if (currentToken && storedRefreshToken) {
      fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${currentToken}` },
        body: JSON.stringify({ refreshToken: storedRefreshToken }),
      }).catch(() => {});
    }
    setUser(null);
    setToken(null);
    localStorage.removeItem('petlink_user');
    localStorage.removeItem('petlink_token');
    localStorage.removeItem('petlink_refresh_token');
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
