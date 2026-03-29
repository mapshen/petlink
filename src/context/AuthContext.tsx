import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
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

function decodeTokenExp(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp ?? null;
  } catch {
    return null;
  }
}

function isTokenExpiringSoon(token: string, thresholdSeconds = 120): boolean {
  const exp = decodeTokenExp(token);
  if (!exp) return true;
  return exp - Date.now() / 1000 < thresholdSeconds;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isRefreshingRef = useRef(false);

  const clearTokens = useCallback(() => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('petlink_user');
    localStorage.removeItem('petlink_token');
    localStorage.removeItem('petlink_refresh_token');
    localStorage.removeItem('petlink_mode');
  }, []);

  const storeTokens = useCallback((accessToken: string, refreshToken: string, userData: User) => {
    setToken(accessToken);
    setUser(userData);
    localStorage.setItem('petlink_token', accessToken);
    localStorage.setItem('petlink_refresh_token', refreshToken);
    localStorage.setItem('petlink_user', JSON.stringify(userData));
  }, []);

  const refreshAccessToken = useCallback(async (): Promise<boolean> => {
    if (isRefreshingRef.current) return false;
    isRefreshingRef.current = true;

    const storedRefreshToken = localStorage.getItem('petlink_refresh_token');
    if (!storedRefreshToken) {
      isRefreshingRef.current = false;
      return false;
    }

    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: storedRefreshToken }),
      });

      if (!res.ok) {
        clearTokens();
        isRefreshingRef.current = false;
        return false;
      }

      const data = await res.json();
      setToken(data.token);
      localStorage.setItem('petlink_token', data.token);
      localStorage.setItem('petlink_refresh_token', data.refreshToken);
      isRefreshingRef.current = false;
      return true;
    } catch {
      isRefreshingRef.current = false;
      return false;
    }
  }, [clearTokens]);

  // Token refresh interval - check every 60 seconds
  useEffect(() => {
    refreshTimerRef.current = setInterval(() => {
      const currentToken = localStorage.getItem('petlink_token');
      if (currentToken && isTokenExpiringSoon(currentToken)) {
        refreshAccessToken();
      }
    }, 60_000);

    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [refreshAccessToken]);

  useEffect(() => {
    const controller = new AbortController();
    const storedToken = localStorage.getItem('petlink_token');
    const storedUser = localStorage.getItem('petlink_user');
    const storedRefreshToken = localStorage.getItem('petlink_refresh_token');

    if (!storedToken || !storedUser) {
      // If no access token but there is a refresh token, try refreshing
      if (storedRefreshToken) {
        refreshAccessToken()
          .then((ok) => {
            if (ok) {
              const freshToken = localStorage.getItem('petlink_token');
              if (freshToken) {
                return fetch(`${API_BASE}/auth/me`, {
                  headers: { Authorization: `Bearer ${freshToken}` },
                  signal: controller.signal,
                }).then((res) => {
                  if (!res.ok) throw new Error('Token invalid');
                  return res.json();
                }).then((data) => {
                  setToken(freshToken);
                  setUser(data.user);
                  localStorage.setItem('petlink_user', JSON.stringify(data.user));
                });
              }
            }
          })
          .catch(() => clearTokens())
          .finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
      return () => controller.abort();
    }

    try {
      JSON.parse(storedUser);
    } catch {
      clearTokens();
      setLoading(false);
      return;
    }

    // If access token is expired, try refreshing first
    if (isTokenExpiringSoon(storedToken, 0)) {
      if (storedRefreshToken) {
        refreshAccessToken()
          .then((ok) => {
            if (ok) {
              const freshToken = localStorage.getItem('petlink_token');
              if (freshToken) {
                return fetch(`${API_BASE}/auth/me`, {
                  headers: { Authorization: `Bearer ${freshToken}` },
                  signal: controller.signal,
                }).then((res) => {
                  if (!res.ok) throw new Error('Token invalid');
                  return res.json();
                }).then((data) => {
                  setToken(freshToken);
                  setUser(data.user);
                  localStorage.setItem('petlink_user', JSON.stringify(data.user));
                });
              }
            }
          })
          .catch(() => clearTokens())
          .finally(() => setLoading(false));
      } else {
        clearTokens();
        setLoading(false);
      }
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
        // Try refresh before clearing
        if (storedRefreshToken) {
          refreshAccessToken().then((ok) => {
            if (!ok) clearTokens();
          });
        } else {
          clearTokens();
        }
      })
      .finally(() => { if (!aborted) setLoading(false); });

    return () => controller.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    storeTokens(data.token, data.refreshToken, data.user);
  }, [storeTokens]);

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
    storeTokens(data.token, data.refreshToken, data.user);
  }, [storeTokens]);

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
    storeTokens(data.token, data.refreshToken, data.user);
    return { isNewUser: data.isNewUser || false };
  }, [storeTokens]);

  const updateUser = useCallback((updatedUser: User) => {
    setUser(updatedUser);
    localStorage.setItem('petlink_user', JSON.stringify(updatedUser));
  }, []);

  const logout = useCallback(async () => {
    const currentToken = localStorage.getItem('petlink_token');
    const storedRefreshToken = localStorage.getItem('petlink_refresh_token');

    // Best-effort server-side revocation
    if (currentToken && storedRefreshToken) {
      fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify({ refreshToken: storedRefreshToken }),
      }).catch(() => {});
    }

    clearTokens();
  }, [clearTokens]);

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
