const FEATURES = [
  {
    title: 'Automated billing & suspension',
    description:
      'Subscriptions move through trial, due, and grace periods automatically, with safe, verified suspension and restoration against your real infrastructure — never a guess, never a false success.',
  },
  {
    title: 'Scoped admin access',
    description:
      'Assign customers to specific admins so each one manages their own book independently, while full oversight and a complete activity log stay with you.',
  },
  {
    title: 'Multi-provider payments',
    description:
      'Route different customer groups to different payment providers, with every transaction verified server-side before anything is ever marked paid.',
  },
  {
    title: 'Built-in customer communication',
    description:
      'Automated notifications, birthday messages, and custom one-off emails all go out under your own brand — no separate marketing tool required.',
  },
];

export default function HomePage() {
  return (
    <main style={{ fontFamily: 'var(--font-ui)', color: 'var(--ink)', background: 'var(--paper)' }}>
      {/* Nav */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '1.2em 2em',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <img src="/dwo-logo.jpg" alt="Web Oracle Host" style={{ height: 32, width: 'auto' }} />
        <a
          href="/login"
          className="btn btn-primary"
          style={{ textDecoration: 'none' }}
        >
          Admin sign in
        </a>
      </header>

      {/* Hero */}
      <section
        style={{
          background: 'var(--forest)',
          color: '#fff',
          padding: '5em 2em',
          textAlign: 'center',
        }}
      >
        <img src="/dwo-logo.jpg" alt="Web Oracle Host" style={{ height: 72, width: 'auto', marginBottom: '1.5em' }} />
        <h1
          style={{
            fontSize: 'clamp(1.8em, 4vw, 2.8em)',
            fontWeight: 700,
            margin: '0 auto 0.5em',
            maxWidth: 720,
            lineHeight: 1.2,
          }}
        >
          The billing and infrastructure control plane for modern hosting providers
        </h1>
        <p
          style={{
            fontSize: '1.1em',
            opacity: 0.85,
            maxWidth: 560,
            margin: '0 auto 2em',
            lineHeight: 1.6,
          }}
        >
          Web Oracle Host manages customers, subscriptions, payments, and Railway infrastructure
          from one place — so you can stop running billing by hand and start scaling.
        </p>
        <a
          href="/login"
          className="btn btn-primary"
          style={{ textDecoration: 'none', fontSize: '1.05em', padding: '0.75em 1.6em' }}
        >
          Sign in to your dashboard
        </a>
      </section>

      {/* Features */}
      <section style={{ padding: '4.5em 2em', maxWidth: 1000, margin: '0 auto' }}>
        <h2
          style={{
            textAlign: 'center',
            fontSize: '1.6em',
            fontWeight: 700,
            marginBottom: '0.3em',
          }}
        >
          Everything a hosting business needs, in one system
        </h2>
        <p style={{ textAlign: 'center', color: 'var(--ink-soft)', maxWidth: 560, margin: '0 auto 3em' }}>
          Built for providers who are done stitching together spreadsheets, payment dashboards,
          and manual Railway logins.
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '1.5em',
          }}
        >
          {FEATURES.map((f) => (
            <div key={f.title} className="card">
              <h3 style={{ fontSize: '1.05em', fontWeight: 600, marginTop: 0, marginBottom: '0.5em' }}>
                {f.title}
              </h3>
              <p style={{ color: 'var(--ink-soft)', fontSize: '0.92em', lineHeight: 1.6, margin: 0 }}>
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <section
        style={{
          background: 'var(--paper-raised)',
          borderTop: '1px solid var(--line)',
          borderBottom: '1px solid var(--line)',
          padding: '3.5em 2em',
          textAlign: 'center',
        }}
      >
        <h2 style={{ fontSize: '1.4em', fontWeight: 700, marginBottom: '0.6em' }}>
          Already have an account?
        </h2>
        <p style={{ color: 'var(--ink-soft)', marginBottom: '1.5em' }}>
          Sign in to manage your customers, subscriptions, and billing.
        </p>
        <a href="/login" className="btn btn-primary" style={{ textDecoration: 'none' }}>
          Admin sign in
        </a>
      </section>

      {/* Footer */}
      <footer
        style={{
          background: 'var(--forest)',
          color: 'rgba(255,255,255,0.75)',
          padding: '2em',
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
