'use client';

import { useState } from 'react';

const WEBSITE_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Not sure yet' },
  { value: 'ONLINE_BANKING', label: 'Online banking' },
  { value: 'INVESTMENT', label: 'Investment / business investment' },
  { value: 'ECOMMERCE', label: 'E-commerce' },
  { value: 'DELIVERY', label: 'Delivery' },
  { value: 'SAAS', label: 'SaaS product' },
  { value: 'WEB_APP', label: 'Web app' },
  { value: 'CORPORATE', label: 'Corporate / brochure site' },
  { value: 'OTHER', label: 'Other' },
];

export default function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [websiteType, setWebsiteType] = useState('');
  const [domainName, setDomainName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successCode, setSuccessCode] = useState<string | null>(null);
  const [domainNotice, setDomainNotice] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }
    if (password.length < 12) {
      setError('Password must be at least 12 characters');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/public/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          password,
          phone: phone || undefined,
          websiteType: websiteType || undefined,
          domainName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message ?? data.error ?? 'Registration failed');
      }
      setSuccessCode(data.customer?.customerCode ?? null);
      if (data.domainOutcome === 'ALREADY_EXISTS') {
        setDomainNotice(data.domainMessage ?? null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(160deg, #16352a 0%, #0e241c 100%)',
        padding: '2em 1.2em',
      }}
    >
      <div className="card" style={{ width: '100%', maxWidth: 460, background: 'var(--paper-raised)' }}>
        <img src="/dwo-logo.jpg" alt="Web Oracle Host" style={{ height: 40, width: 'auto', margin: '0 auto 1.2em', display: 'block' }} />

        {successCode ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.4em', marginBottom: '0.3em' }}>🎉</div>
            <h1 style={{ fontSize: '1.3em', fontWeight: 700, margin: '0 0 0.5em' }}>Account created</h1>
            <p className="mono" style={{ color: 'var(--ink-soft)', margin: '0 0 0.8em' }}>{successCode}</p>
            <p style={{ color: 'var(--ink-soft)', margin: 0 }}>
              Thanks for signing up! Our team will review your details and get your hosting set up
              shortly.
            </p>
            {domainNotice && (
              <p style={{ color: 'var(--clay)', fontSize: '0.85em', marginTop: '1em' }}>{domainNotice}</p>
            )}
          </div>
        ) : (
          <>
            <h1 style={{ fontSize: '1.3em', fontWeight: 700, margin: '0 0 0.3em', textAlign: 'center' }}>
              Create your account
            </h1>
            <p style={{ color: 'var(--ink-soft)', fontSize: '0.9em', textAlign: 'center', margin: '0 0 1.4em' }}>
              Get started with Web Oracle Host — takes about a minute.
            </p>

            <form onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="reg-name">Full name / business name</label>
                <input id="reg-name" required value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="reg-email">Email</label>
                <input id="reg-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="reg-password">Password</label>
                <input
                  id="reg-password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="reg-confirm">Confirm password</label>
                <input
                  id="reg-confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="reg-phone">Phone (optional)</label>
                <input id="reg-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="reg-website-type">What kind of site is this?</label>
                <select id="reg-website-type" value={websiteType} onChange={(e) => setWebsiteType(e.target.value)}>
                  {WEBSITE_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="reg-domain">Domain name</label>
                <input
                  id="reg-domain"
                  required
                  value={domainName}
                  onChange={(e) => setDomainName(e.target.value)}
                  placeholder="example.com"
                />
                <p style={{ fontSize: '0.78em', color: 'var(--ink-soft)', margin: '0.3em 0 0' }}>
                  The domain you want hosted with us.
                </p>
              </div>

              {error && <p className="error-text">{error}</p>}

              <button type="submit" className="btn btn-primary" disabled={submitting} style={{ width: '100%', justifyContent: 'center' }}>
                {submitting ? 'Creating your account…' : 'Create account'}
              </button>
            </form>

            <p style={{ fontSize: '0.85em', color: 'var(--ink-soft)', textAlign: 'center', marginTop: '1.2em', marginBottom: 0 }}>
              Already have hosting with us? <a href="/login" style={{ color: 'var(--forest-bright)' }}>Admin sign in</a>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
