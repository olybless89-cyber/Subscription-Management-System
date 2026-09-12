const FEATURES = [
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2 4 5v6c0 5 3.4 8.7 8 10 4.6-1.3 8-5 8-10V5l-8-3Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
    title: 'Automated billing & suspension',
    description:
      'Subscriptions move through trial, due, and grace periods automatically, with safe, verified suspension and restoration against your real infrastructure — never a guess, never a false success.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
        <path d="M19 8h3M20.5 6.5v3" />
      </svg>
    ),
    title: 'Scoped admin access',
    description:
      'Assign customers to specific admins so each one manages their own book independently, while full oversight, Railway access, and a complete activity log stay with you alone.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
      </svg>
    ),
    title: 'Multi-provider payments',
    description:
      'Route different customer groups to different payment providers, with every transaction verified server-side before anything is ever marked paid.',
  },
  {
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m2 6 10 7 10-7" />
      </svg>
    ),
    title: 'Built-in customer communication',
    description:
      'Automated notifications, birthday messages, and custom one-off emails all go out under your own brand — no separate marketing tool required.',
  },
];

const STEPS = [
  {
    title: 'Create the customer',
    description: 'Capture their details, website type, and domain in one form — auto-assigned to whichever admin created them.',
  },
  {
    title: 'Map their infrastructure',
    description: 'The super admin links the subscription to real Railway resources — the exact hosting mode and suspension strategy for that customer.',
  },
  {
    title: 'Billing runs itself',
    description: 'Payments, reminders, grace periods, and verified suspension/restoration all happen automatically from there.',
  },
];

export default function HomePage() {
  return (
    <main style={{ fontFamily: 'var(--font-ui)', color: 'var(--ink)', background: 'var(--paper)', overflowX: 'hidden' }}>
      {/* Nav */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '1.1em 1.5em',
          borderBottom: '1px solid var(--line)',
          position: 'sticky',
          top: 0,
          background: 'var(--paper)',
          zIndex: 10,
        }}
      >
        <img src="/dwo-logo.jpg" alt="Web Oracle Host" style={{ height: 28, width: 'auto' }} />
        <div style={{ display: 'flex', gap: '0.6em' }}>
          <a href="/register" className="btn" style={{ textDecoration: 'none' }}>
            Get started
          </a>
          <a href="/login" className="btn btn-primary" style={{ textDecoration: 'none' }}>
            Admin sign in
          </a>
        </div>
      </header>

      {/* Hero */}
      <section
        style={{
          background: 'linear-gradient(160deg, #16352a 0%, #0e241c 100%)',
          color: '#fff',
          padding: '4.5em 1.5em',
        }}
      >
        <div className="hero-grid">
          <div>
            <div className="pill-row" style={{ marginBottom: '1.2em' }}>
              <span className="pill">⚡ Server-verified payments</span>
              <span className="pill">🛡 Safety-checked suspension</span>
              <span className="pill">📋 Full activity audit log</span>
            </div>
            <h1
              style={{
                fontSize: 'clamp(1.9em, 4.2vw, 2.9em)',
                fontWeight: 700,
                margin: '0 0 0.5em',
                lineHeight: 1.15,
                letterSpacing: '-0.01em',
              }}
            >
              The billing and infrastructure control plane for modern hosting providers
            </h1>
            <p
              style={{
                fontSize: '1.1em',
                opacity: 0.8,
                maxWidth: 480,
                margin: '0 0 2em',
                lineHeight: 1.6,
              }}
            >
              Web Oracle Host manages customers, subscriptions, payments, and Railway
              infrastructure from one place — so you can stop running billing by hand and
              start scaling.
            </p>
            <div style={{ display: 'flex', gap: '0.8em', flexWrap: 'wrap' }}>
              <a
                href="/register"
                className="btn btn-primary"
                style={{ textDecoration: 'none', fontSize: '1.02em', padding: '0.75em 1.6em' }}
              >
                Get started — create your account
              </a>
              <a
                href="/login"
                className="btn"
                style={{
                  textDecoration: 'none',
                  fontSize: '1.02em',
                  padding: '0.75em 1.6em',
                  background: 'transparent',
                  borderColor: 'rgba(255,255,255,0.3)',
                  color: '#fff',
                }}
              >
                Admin sign in
              </a>
            </div>
          </div>

          {/* Stylized dashboard preview — illustrative, not a real screenshot */}
          <div className="dashboard-mock">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8em' }}>
              <span style={{ fontSize: '0.78em', fontFamily: 'var(--font-mono)', opacity: 0.6, letterSpacing: '0.02em' }}>
                SUBSCRIPTIONS
              </span>
              <span style={{ fontSize: '0.78em', opacity: 0.5 }}>Live</span>
            </div>
            {[
              { code: 'WOH-000104', status: 'Active', color: '#4ade80' },
              { code: 'WOH-000098', status: 'Grace period', color: '#facc15' },
              { code: 'WOH-000091', status: 'Suspended', color: '#f87171' },
              { code: 'WOH-000087', status: 'Active', color: '#4ade80' },
            ].map((row) => (
              <div className="dashboard-mock-row" key={row.code}>
                <span className="mono" style={{ opacity: 0.85 }}>{row.code}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5em', opacity: 0.85 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: row.color, display: 'inline-block' }} />
                  {row.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: '4.5em 1.5em', maxWidth: 1050, margin: '0 auto' }}>
        <h2 style={{ textAlign: 'center', fontSize: '1.7em', fontWeight: 700, marginBottom: '0.3em' }}>
          Everything a hosting business needs, in one system
        </h2>
        <p style={{ textAlign: 'center', color: 'var(--ink-soft)', maxWidth: 560, margin: '0 auto 3em' }}>
          Built for providers who are done stitching together spreadsheets, payment dashboards,
          and manual Railway logins.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.3em' }}>
          {FEATURES.map((f) => (
            <div key={f.title} className="feature-card">
              <div className="feature-icon">{f.icon}</div>
              <h3 style={{ fontSize: '1.03em', fontWeight: 600, marginTop: 0, marginBottom: '0.5em' }}>
                {f.title}
              </h3>
              <p style={{ color: 'var(--ink-soft)', fontSize: '0.91em', lineHeight: 1.6, margin: 0 }}>
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" style={{ background: 'var(--paper-raised)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)', padding: '4.5em 1.5em' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: '1.7em', fontWeight: 700, marginBottom: '2.5em' }}>
            From new customer to automated billing, in three steps
          </h2>
          <div className="layout-3col">
            {STEPS.map((step, i) => (
              <div key={step.title}>
                <div className="step-number">{i + 1}</div>
                <h3 style={{ fontSize: '1em', fontWeight: 600, marginTop: 0, marginBottom: '0.4em' }}>{step.title}</h3>
                <p style={{ color: 'var(--ink-soft)', fontSize: '0.9em', lineHeight: 1.6, margin: 0 }}>{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section style={{ padding: '4em 1.5em', textAlign: 'center' }}>
        <h2 style={{ fontSize: '1.4em', fontWeight: 700, marginBottom: '0.6em' }}>
          Ready to get started?
        </h2>
        <p style={{ color: 'var(--ink-soft)', marginBottom: '1.5em' }}>
          New customer? Create your account. Already with us? Sign in below.
        </p>
        <div style={{ display: 'flex', gap: '0.8em', justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="/register" className="btn btn-primary" style={{ textDecoration: 'none' }}>
            Create your account
          </a>
          <a href="/login" className="btn" style={{ textDecoration: 'none' }}>
            Admin sign in
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{
          background: 'var(--forest)',
          color: 'rgba(255,255,255,0.75)',
          padding: '2em 1.5em',
          textAlign: 'center',
          fontSize: '0.85em',
        }}
      >
        <div style={{ marginBottom: '0.4em', fontWeight: 600, color: '#fff' }}>Web Oracle Host</div>
        <div>Digital Web Oracle ICT (DWO) — Abuja, Nigeria</div>
      </footer>
    </main>
  );
}
