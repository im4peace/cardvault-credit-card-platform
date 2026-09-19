import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, tokenStore, UNAUTHORIZED_EVENT } from '../api/client';
import type { AuthUser } from '../types';

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (b: { email: string; password: string; firstName: string; lastName: string }) => Promise<AuthUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(() => tokenStore.get() !== null);

  useEffect(() => {
    if (!tokenStore.get()) return;
    api
      .me()
      .then(setUser)
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  async function login(email: string, password: string) {
    const res = await api.login(email, password);
    tokenStore.set(res.token);
    setUser(res.user);
    return res.user;
  }

  async function register(b: Parameters<typeof api.register>[0]) {
    const res = await api.register(b);
    tokenStore.set(res.token);
    setUser(res.user);
    return res.user;
  }

  function logout() {
    tokenStore.clear();
    setUser(null);
  }

  const value: AuthState = { user, loading, login, register, logout };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
