'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface CustomerSession {
  token: string;
}

interface CustomerAuthContextValue {
  session: CustomerSession | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
}

const CustomerAuthContext = createContext<CustomerAuthContextValue | null>(null);

const STORAGE_KEY = 'woh_customer_session';

/**
 * Same localStorage tradeoff as the admin AuthProvider. Kept as an
 * entirely separate context/storage key rather than extending the
 * admin one: a customer session and an admin session are different
 * shapes (no role, no canManageAdmins) and mixing them invites exactly
 * the kind of bug where a customer's token accidentally gets sent to an
 * admin-only route or vice versa.
 */
export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<CustomerSession | null>(null);
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
      const res = await fetch('/api/auth/customer-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        return { ok: false, error: data.error ?? 'Login failed' };
      }
      const next: CustomerSession = { token: data.token };
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

  return (
    <CustomerAuthContext.Provider value={{ session, loading, login, logout }}>
      {children}
    </CustomerAuthContext.Provider>
  );
}

export function useCustomerAuth(): CustomerAuthContextValue {
  const ctx = useContext(CustomerAuthContext);
  if (!ctx) throw new Error('useCustomerAuth must be used within CustomerAuthProvider');
  return ctx;
}
