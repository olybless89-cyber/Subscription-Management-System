'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCustomerAuth } from '../../_components/CustomerAuthProvider';

export default function ClientLoginPage() {
  const { login } = useCustomerAuth();
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
      router.push('/client/dashboard');
    } else {
      setError(result.error ?? 'Login failed');
    }
  }

  return (
    <main className="w3-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2em 1.2em' }}>
      <div className="w3-content" style={{ width: '100%', maxWidth: 420 }}>
        <div className="w3-panel">
          <div style={{ textAlign: 'center', marginBottom: '1.6em' }}>
            <img src="/dwo-logo.jpg" alt="Web Oracle Host" style={{ height: 34, width: 'auto', margin: '0 auto 1em', display: 'block', borderRadius: 6 }} />
            <div className="w3-label" style={{ marginBottom: '0.3em' }}>CLIENT PORTAL</div>
            <h1 style={{ fontSize: '1.3em', fontWeight: 700, margin: 0 }}>Sign in to your dashboard</h1>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1em' }}>
              <label htmlFor="client-email" className="w3-label" style={{ display: 'block', marginBottom: '0.5em' }}>Email</label>
              <input
                id="client-email"
                type="email"
                required
                autoComplete="username"
                className="w3-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div style={{ marginBottom: '1.4em' }}>
              <label htmlFor="client-password" className="w3-label" style={{ display: 'block', marginBottom: '0.5em' }}>Password</label>
              <input
                id="client-password"
                type="password"
                required
                autoComplete="current-password"
                className="w3-input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && <p style={{ color: 'var(--w3-danger)', fontSize: '0.88em', marginBottom: '1em' }}>{error}</p>}

            <button type="submit" className="w3-btn" disabled={submitting} style={{ width: '100%', justifyContent: 'center' }}>
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: '0.85em', color: 'var(--w3-text-soft)', marginTop: '1.4em', marginBottom: 0 }}>
            New here? <a href="/register" style={{ color: 'var(--w3-cyan)' }}>Create an account</a>
          </p>
        </div>
      </div>
    </main>
  );
}
