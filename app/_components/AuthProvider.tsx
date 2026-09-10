'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface Session {
  token: string;
  role: 'SUPER_ADMIN' | 'ADMIN';
  email: string;
}

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = 'woh_admin_session';

/**
 * Session storage tradeoff, stated plainly: the token lives in
 * localStorage so a page refresh doesn't log the admin out. That is
 * readable by any script running on the page, which is the standard
 * XSS exposure of any localStorage-based token — there is no httpOnly
 * cookie here. Acceptable for an internal admin tool used by a small,
 * trusted team; revisit (move the token into an httpOnly cookie set by
 * the login route, and read it server-side) before this is exposed to
 * a broader or less-trusted audience.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setSession(JSON.parse(raw));
    } catch {
      // Corrupt/missing storage — just start logged out.
    }
    setLoading(false);
  }, []);

  async function login(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
    try {
      const res = await fetch('/api/auth/admin-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.error ?? 'Login failed' };
      }
      const next: Session = { token: data.token, role: data.role, email };
      setSession(next);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return { ok: true };
    } catch {
      return { ok: false, error: 'Could not reach the server' };
    }
  }

  function logout() {
    setSession(null);
    window.localStorage.removeItem(STORAGE_KEY);
  }

  return <AuthContext.Provider value={{ session, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
