'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../_components/AuthProvider';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const result = await login(email, password);
    setSubmitting(false);
    if (result.ok) {
      router.push('/dashboard');
    } else {
      setError(result.error ?? 'Login failed');
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--forest)',
      }}
    >
      <div className="card" style={{ width: 360, background: 'var(--paper-raised)' }}>
        <div style={{ marginBottom: '1.6em' }}>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '0.8em',
              color: 'var(--ink-soft)',
              letterSpacing: '0.02em',
            }}
          >
            WEB ORACLE HOST
          </div>
          <h1 style={{ fontSize: '1.3em', margin: '0.2em 0 0', fontWeight: 700 }}>
            Admin sign in
          </h1>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <p className="error-text" style={{ marginTop: -4, marginBottom: '1em' }}>{error}</p>}

          <button type="submit" className="btn btn-primary" disabled={submitting} style={{ width: '100%', justifyContent: 'center' }}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  );
}
